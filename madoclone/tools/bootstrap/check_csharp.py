#!/usr/bin/env python3
"""C# をコンパイルできない環境のための静的検査（dotnet が使える環境では、同じ種類の誤りを dotnet build が見つける）。

1. 括弧の釣り合い：Assets/Game と tools の .cs の { } ( ) [ ] が、文字列・コメント・文字リテラルを除いて合っている。
2. 型と JSON の突き合わせ：Newtonsoft（MissingMemberHandling.Error、Required、列挙型の EnumMember、Ranked の展開）が
   実データを受け付けるかを、C# のソースを読んで再現して確かめる。
   - JSON のキーに対応するプロパティがある（大文字小文字は区別しない）
   - 必須（[JsonObject(ItemRequired = Always)] か [JsonProperty(Required = Always/AllowNull)]）の項目がすべてのレコードにある
   - 値の種類（数・文字列・真偽・配列・オブジェクト）が型と合う。列挙型は EnumMember の綴りの中にある
   - Ranked<T> は「T の形」か「長さ3の配列」
3. 列挙型：EnumMember の綴りが重複していない。

読み込みの対応表は DataLoader.cs の Parse<...>(source, XxxFile, issues) から取る（コードと検査が食い違わないように）。
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
GAME = ROOT / "Assets/Game"
JSON_DIR = GAME / "Data/Json"

errors = []
notes = []


def err(msg):
    errors.append(msg)


# ---------------------------------------------------------------- 1. 括弧

def strip_literals(text):
    """コメント・文字列・文字リテラルを空白に置き換える（行の数は保つ）。"""
    out = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        two = text[i:i + 2]
        if two == "//":
            j = text.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
        elif two == "/*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r"[^\n]", " ", text[i:j]))
            i = j
        elif two == '@"':
            j = i + 2
            while j < n:
                if text[j] == '"':
                    if text[j + 1:j + 2] == '"':
                        j += 2
                        continue
                    break
                j += 1
            out.append(re.sub(r"[^\n]", " ", text[i:j + 1]))
            i = j + 1
        elif c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                if text[j] == "\\":
                    j += 1
                if text[j] == "\n":
                    break
                j += 1
            out.append(" " * (j + 1 - i))
            i = j + 1
        elif c == "'":
            j = i + 1
            while j < n and text[j] != "'":
                if text[j] == "\\":
                    j += 1
                j += 1
            out.append(" " * (j + 1 - i))
            i = j + 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def check_balance(path):
    text = strip_literals(path.read_text(encoding="utf-8"))
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    line = 1
    for ch in text:
        if ch == "\n":
            line += 1
        elif ch in "([{":
            stack.append((ch, line))
        elif ch in pairs:
            if not stack or stack[-1][0] != pairs[ch]:
                err("%s:%d: 括弧が合わない '%s'" % (path.relative_to(ROOT), line, ch))
                return
            stack.pop()
    if stack:
        err("%s:%d: 閉じていない '%s'" % (path.relative_to(ROOT), stack[-1][1], stack[-1][0]))


# ---------------------------------------------------------------- 2. 型の読み取り

class Prop:
    def __init__(self, name, type_text, required, writable):
        self.name, self.type_text, self.required, self.writable = name, type_text, required, writable


class Cls:
    def __init__(self, name, base, item_required):
        self.name, self.base, self.item_required = name, base, item_required
        self.props = []


def parse_enums(text):
    enums = {}
    for m in re.finditer(r"public enum (\w+)\s*\{(.*?)\n    \}", text, flags=re.S):
        values = []
        for line in m.group(2).split("\n"):
            em = re.search(r'EnumMember\(Value = "([^"]*)"\)\]\s*(\w+)', line)
            if em:
                values.append(em.group(1))
            else:
                nm = re.match(r"\s*(\w+),", line)
                if nm:
                    n = nm.group(1)
                    values.append(n[0].lower() + n[1:])
        enums[m.group(1)] = values
        if len(values) != len(set(values)):
            err("列挙型 %s の綴りが重複している" % m.group(1))
    return enums


def parse_classes(path, enums):
    raw = path.read_text(encoding="utf-8")
    text = strip_literals(raw)
    # 属性は文字列（"..."）を消さずに読みたいので、属性だけ元の文で見る。
    raw_lines = raw.split("\n")
    lines = text.split("\n")
    classes = {}
    i = 0
    while i < len(lines):
        m = re.match(r"\s*public (?:sealed |abstract |static )*class (\w+)(<\w+>)?\s*(?::\s*(\w+))?", lines[i])
        if not m:
            i += 1
            continue
        name, generic, base = m.group(1), m.group(2), m.group(3)
        # 直前の属性行
        item_required = False
        j = i - 1
        while j >= 0 and raw_lines[j].strip().startswith("["):
            if "ItemRequired = Required.Always" in raw_lines[j]:
                item_required = True
            j -= 1
        cls = Cls(name + (generic or ""), base, item_required)
        # 本体の範囲
        depth = 0
        k = i
        started = False
        body = []
        while k < len(lines):
            for ch in lines[k]:
                if ch == "{":
                    depth += 1
                    started = True
                elif ch == "}":
                    depth -= 1
            body.append(k)
            if started and depth == 0:
                break
            k += 1
        parse_members(cls, body, lines, raw_lines)
        classes[cls.name] = cls
        i = k + 1
    return classes


def parse_members(cls, body, lines, raw_lines):
    depth = 0
    attrs = []
    idx = 0
    while idx < len(body):
        k = body[idx]
        line = lines[k]
        d0 = depth
        stripped = line.strip()
        if d0 == 1:
            if stripped.startswith("["):
                attrs.append(raw_lines[k].strip())
            else:
                m = re.match(r"public\s+(?!sealed|abstract|static|const|override|enum|class|readonly|event)(.+?)\s+(\w+)\s*(\{.*)?$", stripped)
                if m and "(" not in stripped.split("{")[0] and "=>" not in stripped.split("{")[0]:
                    type_text, pname = m.group(1).strip(), m.group(2)
                    # アクセサの範囲を集める
                    acc, dd, kk = "", 0, idx
                    started = False
                    while kk < len(body):
                        for ch in lines[body[kk]]:
                            if ch == "{":
                                dd += 1
                                started = True
                            elif ch == "}":
                                dd -= 1
                        acc += lines[body[kk]] + "\n"
                        if started and dd == 0:
                            break
                        kk += 1
                    writable = bool(re.search(r"\b(init|set)\b", acc))
                    ignored = any("JsonIgnore" in a for a in attrs)
                    required = None
                    for a in attrs:
                        rm = re.search(r"Required = Required\.(\w+)", a)
                        if rm and "JsonProperty" in a:
                            required = rm.group(1)
                    if not ignored and "{" in acc:
                        cls.props.append(Prop(pname, type_text, required, writable))
                attrs = []
            if not stripped.startswith("["):
                pass
        for ch in line:
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
        idx += 1


# ---------------------------------------------------------------- 3. 値の検査

class Checker:
    def __init__(self, classes, enums):
        self.classes, self.enums = classes, enums
        self.seen = {}   # (クラス, プロパティ) -> 出てきた回数

    def props_of(self, cls_name):
        cls = self.classes[cls_name]
        props = list(cls.props)
        if cls.base and cls.base in self.classes:
            props = self.props_of(cls.base) + props
        return props

    def item_required(self, cls_name):
        cls = self.classes[cls_name]
        if cls.item_required:
            return True
        return bool(cls.base and cls.base in self.classes and self.item_required(cls.base))

    def check(self, value, type_text, path):
        t = type_text.strip()
        nullable = t.endswith("?")
        if nullable:
            t = t[:-1]
        if value is None:
            if not nullable and not t.startswith(("IReadOnly", "Ranked")) and t not in ("string",):
                err("%s: null は書けない（%s）" % (path, type_text))
            return
        m = re.match(r"IReadOnlyList<(.+)>$", t)
        if m:
            if not isinstance(value, list):
                err("%s: 配列で書く（%s）" % (path, t))
                return
            for i, v in enumerate(value):
                self.check(v, m.group(1), "%s[%d]" % (path, i))
            return
        m = re.match(r"IReadOnlyDictionary<string,\s*(.+)>$", t)
        if m:
            if not isinstance(value, dict):
                err("%s: オブジェクトで書く（%s）" % (path, t))
                return
            for k, v in value.items():
                self.check(v, m.group(1), "%s.%s" % (path, k))
            return
        m = re.match(r"Ranked<(.+)>$", t)
        if m:
            inner = m.group(1)
            is_array_elem = inner.endswith("[]")
            ranked_form = isinstance(value, list) and (not is_array_elem or (len(value) > 0 and isinstance(value[0], list)))
            if ranked_form:
                if len(value) != 3:
                    err("%s: ランクで変わる値は長さ3の配列（今は %d）" % (path, len(value)))
                    return
                for i, v in enumerate(value):
                    self.check(v, inner, "%s[%d]" % (path, i))
            else:
                self.check(value, inner, path)
            return
        if t.endswith("[]"):
            if not isinstance(value, list):
                err("%s: 配列で書く（%s）" % (path, t))
                return
            for i, v in enumerate(value):
                self.check(v, t[:-2], "%s[%d]" % (path, i))
            return
        if t == "double":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                err("%s: 数で書く（%r）" % (path, value))
        elif t == "int":
            if isinstance(value, bool) or not isinstance(value, (int, float)) or (isinstance(value, float) and value != int(value)):
                err("%s: 整数で書く（%r）" % (path, value))
        elif t == "bool":
            if not isinstance(value, bool):
                err("%s: true/false で書く（%r）" % (path, value))
        elif t == "string":
            if not isinstance(value, str):
                err("%s: 文字列で書く（%r）" % (path, value))
        elif t in self.enums:
            if not isinstance(value, str) or value not in self.enums[t]:
                err("%s: %s の綴りにない値 %r（正しくは %s）" % (path, t, value, "／".join(self.enums[t])))
        elif t in self.classes:
            self.check_object(value, t, path)
        else:
            err("%s: 型 %s を検査できない（検査の道具に足す）" % (path, t))

    def check_object(self, value, cls_name, path):
        if not isinstance(value, dict):
            err("%s: オブジェクトで書く（%s）" % (path, cls_name))
            return
        props = [p for p in self.props_of(cls_name) if p.writable]
        by_lower = {p.name.lower(): p for p in props}
        item_req = self.item_required(cls_name)
        present = set()
        for key, v in value.items():
            p = by_lower.get(key.lower())
            if p is None:
                err("%s: %s に項目 %r が無い（MissingMemberHandling.Error で弾かれる）" % (path, cls_name, key))
                continue
            present.add(p.name)
            self.seen[(cls_name, p.name)] = self.seen.get((cls_name, p.name), 0) + 1
            if p.required == "AllowNull" and v is None:
                continue
            if (p.required == "Always" or (item_req and p.required in (None,))) and v is None:
                err("%s.%s: Required のため null は書けない" % (path, key))
                continue
            self.check(v, p.type_text, "%s.%s" % (path, key))
        for p in props:
            required = p.required in ("Always", "AllowNull") or (item_req and p.required is None)
            if required and p.name not in present:
                err("%s: 必須の項目 %s が無い（%s）" % (path, p.name, cls_name))


def main():
    cs_files = [p for p in list((GAME).rglob("*.cs")) + list((ROOT / "tools").rglob("*.cs")) if "/obj/" not in str(p) and "/bin/" not in str(p)]
    for p in cs_files:
        check_balance(p)

    enums = parse_enums((GAME / "Data/Enums.cs").read_text(encoding="utf-8"))
    classes = {}
    for p in sorted((GAME / "Data").glob("*.cs")):
        classes.update(parse_classes(p, enums))
    # ItemsFile<T> を、使われている T ごとに具体化する
    loader = (GAME / "Data/DataLoader.cs").read_text(encoding="utf-8")
    consts = dict(re.findall(r'public const string (\w+File) = "([^"]+)"', loader))
    mapping = re.findall(r"Parse<(.+?)>\(source, (\w+File), issues\)", loader)
    if not mapping:
        err("DataLoader.cs から Parse<...> の対応表を読めない")
    checker = Checker(classes, enums)
    for type_text, const_name in mapping:
        fname = consts.get(const_name)
        if not fname:
            err("DataLoader.cs: 定数 %s が見つからない" % const_name)
            continue
        data = json.loads((JSON_DIR / fname).read_text(encoding="utf-8"))
        m = re.match(r"ItemsFile<(\w+)>$", type_text)
        if m:
            item_type = m.group(1)
            if "ItemsFile<T>" not in classes:
                err("ItemsFile<T> が見つからない")
                continue
            props = {p.name: p for p in classes["ItemsFile<T>"].props}
            if set(data) != {"schemaVersion", "items"}:
                err("%s: 最上位の項目が schemaVersion と items ではない: %s" % (fname, sorted(data)))
            checker.check(data.get("schemaVersion"), "int", fname + ".schemaVersion")
            checker.check(data.get("items"), "IReadOnlyList<%s>" % item_type, fname + ".items")
        elif type_text.startswith("Dictionary<"):
            checker.check(data, "IReadOnlyDictionary<string, string>", fname)
        else:
            checker.check(data, type_text, fname)

    # 使われていない項目の一覧（情報だけ）
    unused = []
    for name, cls in classes.items():
        if name.startswith("ItemsFile"):
            continue
        for p in cls.props:
            if p.writable and checker.seen.get((name, p.name), 0) == 0:
                unused.append("%s.%s" % (name, p.name))
    # 継承元の項目は、継承先で数えているので除く
    unused = [u for u in unused if not u.startswith(("SkillDefBase.",))]
    if unused:
        notes.append("実データに1回も出てこない項目（型にだけある）: " + "、".join(unused))

    for e in errors:
        print("エラー:", e)
    for n in notes:
        print("メモ:", n)
    print("check_csharp: .cs %d 本、型 %d 個、エラー %d" % (len(cs_files), len(classes), len(errors)))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
