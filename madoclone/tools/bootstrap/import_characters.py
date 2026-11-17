#!/usr/bin/env python3
"""dev/キャラデータ.md → characters.json / skills.json / crystals.json / text/ja.json / dev/sourcemap.json

初回取り込み用（docs/02 7.1節）。取り込んだあとは JSON が正で、調整は JSON を直接直す。
読めなかった部分は捨てずに out/import_report.md に出し、該当スキルに needsReview を付ける。
tools/Mado.Importer（C#）ができるまでの代わり。標準ライブラリだけで動く。
"""
import io
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "dev", "キャラデータ.md")
OUT_JSON = os.path.join(ROOT, "Assets", "Game", "Data", "Json")
REPORT = os.path.join(ROOT, "out", "import_report.md")
SOURCEMAP = os.path.join(ROOT, "dev", "sourcemap.json")

ELEMENT = {"勇": "valor", "技": "skill", "心": "heart", "知": "wisdom"}
ROLE = {"近距離": "melee", "遠距離": "ranged", "防御": "defense", "回復": "heal", "妨害": "disrupt"}
ROLE_TYPE = {"melee": "melee_attacker", "ranged": "ranged_attacker", "defense": "tank",
             "heal": "healer", "disrupt": "supporter"}
TIER_OF_KAKU = {"LR": "lr", "極": "kyoku", "天": "ten", "煌": "kou", "彩": "sai", "灯": "tou", "素": "so"}
BUFF_TIER = {"最上級": "supreme", "上級": "high", "中級": "mid", "下級": "low"}

# 能力名（アップ／ダウンが付くもの）。長い名前を先に書く
STAT_NAMES = [
    ("クリティカルダメージ", "crit_dmg"), ("クリティカル防御", "crit_def"), ("クリティカル耐性", "crit_resist"),
    ("クリティカル率", "crit_rate"), ("クリダメ", "crit_dmg"), ("クリ防御", "crit_def"), ("クリ耐性", "crit_resist"),
    ("クリ率", "crit_rate"), ("攻撃力", "atk"), ("防御力", "def"), ("命中率", "accuracy"), ("回避率", "evasion"),
    ("攻撃", "atk"), ("防御", "def"), ("命中", "accuracy"), ("回避", "evasion"),
]
STAT_RE = "|".join(n for n, _ in STAT_NAMES)
STAT_ID = dict(STAT_NAMES)

# 段階つき・段階なしの状態（アップ／ダウンが付かないもの）
STATUS_NAMES = [
    ("行動阻害バリア", "cc_barrier"), ("バリア", "cc_barrier"), ("持続回復", "regen"), ("治癒禁止", "heal_block"),
    ("治療禁止", "heal_block"), ("ダメージ反射シールド", "reflect_shield"), ("クリティカルシールド", "crit_shield"), ("シールド", "shield"), ("火傷", "burn"), ("痺れ", "paralysis"), ("出血", "bleed"),
    ("氷結", "freeze"), ("束縛", "bind"), ("沈黙", "silence"), ("暗闇", "blind"), ("挑発", "taunt"), ("無敵", "invincible"),
]
STATUS_RE = "|".join(n for n, _ in STATUS_NAMES)
STATUS_ID = dict(STATUS_NAMES)
DEBUFF_STATUS = {"heal_block", "burn", "paralysis", "bleed", "freeze", "bind", "silence", "blind", "taunt"}
TIERLESS = {"cc_barrier", "heal_block", "bind", "silence", "blind", "taunt", "invincible", "crit_shield", "reflect_shield"}  # 段階を持たない

SUBSTAT = {"命中": "accuracyPct", "回避": "evasionPct", "クリ率": "critRatePct", "クリ耐性": "critResistPct",
           "クリダメ": "critDamagePct", "クリ防御": "critDefensePct"}

NUM = r"\d+(?:\.\d+)?"


def num(x):
    f = float(x)
    return int(f) if f == int(f) else f


# ---------------------------------------------------------------- 効果の読み取り

class Skill:
    def __init__(self, sid, kind):
        self.id = sid
        self.kind = kind
        self.trigger = None
        self.effects = []
        self.issues = []

    def issue(self, text):
        if text not in self.issues:
            self.issues.append(text)


COMMENT_PAREN = re.compile(r"[（(][^（）()]*(?:Wiki|推定|誤記|転記|ダメージ倍率|近距離|遠距離)[^（）()]*[）)]")
TIER_PAREN = re.compile(r"[（(](最上級|上級|中級|下級)[）)]")


def strip_comments(text, skill):
    def repl(m):
        inner = m.group(0)
        if "推定" in inner or "誤記" in inner or "転記" in inner or "Wiki" in inner:
            skill.issue("元資料に「推定・誤記」の注記あり: " + inner)
        return ""
    return COMMENT_PAREN.sub(repl, text)


def parse_trigger(kind, body, skill):
    """先頭の発動条件を読み、残りの本文を返す。"""
    b = body.strip()
    if kind == "normal":
        return {"type": "attackInterval"}, b
    m = re.match(r"(%s)秒ごと" % NUM, b)
    if m:
        t = {"type": "cooldown", "cooldownSec": num(m.group(1))} if kind == "ultimate" \
            else {"type": "interval", "everySec": num(m.group(1))}
        return t, b[m.end():]
    if kind == "ultimate":
        skill.issue("必殺なのにクールタイムが読めない")
        return {"type": "cooldown", "cooldownSec": None}, b
    m = re.match(r"((?:%s)(?:[・](?:%s))*)(?:中|状態)の(?:対象|相手)に通常命中で" % (STATUS_RE, STATUS_RE), b)
    if m:
        skill.issue("条件つきの効果（条件の対象と範囲を確かめる）")
        return {"type": "onHit", "chancePct": 100,
                "if": {"targetHasAnyStatus": [STATUS_ID[n] for n in re.findall(STATUS_RE, m.group(1))]}}, b[m.end():]
    m = re.match(r"通常命中で(\d+)%の確率で", b)
    if m:
        return {"type": "onHit", "chancePct": num(m.group(1))}, b[m.end():]
    m = re.match(r"常時[、 ]?", b)
    if m:
        return {"type": "always"}, b[m.end():]
    m = re.match(r"(?:通常)?命中[後時](?:(\d+)%で)?[、]?", b)
    if m:
        return {"type": "onHit", "chancePct": num(m.group(1)) if m.group(1) else 100}, b[m.end():]
    m = re.match(r"クリ(?:ティカル)?時[、]?", b)
    if m:
        return {"type": "onCrit"}, b[m.end():]
    m = re.match(r"フィールドにいる間[、]?", b)
    if m:
        return {"type": "always"}, b[m.end():]
    m = re.match(r"(?:戦闘|バトル)開始時[、]?", b)
    if m:
        return {"type": "onBattleStart"}, b[m.end():]
    m = re.match(r"戦闘不能(?:時|になったとき)[、]?", b)
    if m:
        return {"type": "onDeath"}, b[m.end():]
    m = re.match(r"(?:被攻撃時|被ダメ時|攻撃を受けたとき)(?:(\d+)%で)?[、]?", b)
    if m:
        return {"type": "onDamaged", "chancePct": num(m.group(1)) if m.group(1) else 100}, b[m.end():]
    m = re.match(r"敵撃破時[、]?", b)
    if m:
        return {"type": "onKill"}, b[m.end():]
    m = re.match(r"HP(\d+)%以下で一度だけ", b)
    if m:
        return {"type": "onHpBelow", "pct": num(m.group(1)), "once": True}, b[m.end():]
    m = re.match(r"自分に常時", b)
    if m:
        return {"type": "always"}, "自分に" + b[m.end():]
    skill.issue("発動条件が読めない")
    return {"type": "unknown"}, b


TARGET_PATTERNS = [
    (r"対象の範囲内の敵に", "enemy_area", None),
    (r"範囲内の敵に", "enemy_area", None),
    (r"([勇技心知])属性の味方(?:全[体員])?[にの]?", "ally_element", 1),
    (r"敵全[体員]に?", "enemy_all", None),
    (r"味方全[体員]に?|味方ごとに", "ally_all", None),
    (r"(?:相手|その敵)[にをの]", "target", None),
    (r"HP(?:が)?最[低も]+(?:低い)?の?味方を", "ally_lowest_hp", None),
    (r"自分[にの]?|自HPを", "self", None),
    (r"攻撃者[にを]", "attacker", None),
    (r"対象[にをの]", "target", None),
    (r"範囲", "enemy_area", None),
    (r"単体", "enemy_single", None),
]

COND_STATUS = r"(?:%s)" % STATUS_RE


def parse_segments(kind, body, skill):
    """本文を「、。＋」で区切り、文脈（対象・確率・秒数）を引き継ぎながら効果にする。"""
    ctx = {"target": None, "chance": None, "duration": None, "when": None, "cond": None}
    main_target = None  # ダメージの対象（デバフの既定の対象になる）
    first = True
    for m in re.finditer(r"[（(]?([勇技心知])属性(?:の味方)?人数で[^）)。]*?(?:最大\+?(%s)(%%|秒)[^）)、。]*)?[）)]" % NUM, body):
        skill.effects.append({"type": "elementCountBonus", "element": ELEMENT[m.group(1)],
                              "max": num(m.group(2)) if m.group(2) else None,
                              "unit": {"%": "pct", "秒": "sec", None: None}[m.group(3)]})
        skill.issue("属性人数による補正（1人あたりの量と、何に掛かるかを確かめる）")
    body = re.sub(r"[（(]?[勇技心知]属性(?:の味方)?人数で[^）)。]*?(?:最大\+?%s(?:%%|秒)[^）)、。]*)?[）)]" % NUM, "", body)
    m = re.search(r"[（(]対象のデバフ[^）)]*[）)]", body)
    if m:
        skill.issue("デバフ数による補正: " + m.group(0))
        body = body.replace(m.group(0), "")
    for seg in re.split(r"[、。＋]", body):
        seg = seg.strip()
        if not seg:
            continue
        rest = seg
        seg_target = None
        seg_cond = None

        # 「属性人数で…」は補正の式。読めた範囲で記録して、人が確かめる
        m = re.search(r"[（(]?([勇技心知])属性(?:の味方)?人数で[^）)、。]*[）)]?", rest)
        if m:
            mx = re.search(r"最大\+?(%s)(%%|秒)" % NUM, m.group(0))
            skill.effects.append({"type": "elementCountBonus", "element": ELEMENT[m.group(1)],
                                  "max": num(mx.group(1)) if mx else None,
                                  "unit": ("pct" if mx.group(2) == "%" else "sec") if mx else None})
            skill.issue("属性人数による補正（1人あたりの量と、何に掛かるかを確かめる）")
            rest = rest.replace(m.group(0), "")
        m = re.search(r"[（(]対象のデバフ[^）)]*[）)]", rest)
        if m:
            skill.issue("デバフ数による補正: " + m.group(0))
            rest = rest.replace(m.group(0), "")

        # 条件：「火傷・痺れなら追加300%」「火傷か痺れの対象に」「範囲内の火傷の敵に」「出血中なら」
        m = re.search(r"(?:対象が)?((?:%s)(?:[・かor]+(?:%s))*)(?:中|状態)?(?:なら|の対象に|の敵(?:全体)?に)" % (COND_STATUS, COND_STATUS), rest)
        if m:
            names = re.findall(COND_STATUS, m.group(1))
            seg_cond = {"targetHasAnyStatus": [STATUS_ID[n] for n in names]}
            if "範囲内の" in rest[:m.start()] + m.group(0):
                seg_target = "enemy_area"
            if "敵全体に" in m.group(0):
                seg_target = "enemy_all"
            rest = rest[:m.start()].replace("範囲内の", "") + rest[m.end():]
            skill.issue("条件つきの効果（条件の対象と範囲を確かめる）")
        m = re.match(r"((?:%s)(?:[・](?:%s))*)中の", rest)
        if m:
            names = re.findall(COND_STATUS, m.group(1))
            seg_cond = {"targetHasAnyStatus": [STATUS_ID[n] for n in names]}
            rest = rest[m.end():]
            skill.issue("条件つきの効果（条件の対象と範囲を確かめる）")

        if "味方ごとに" in rest:
            skill.issue("「味方ごとに」（味方全体として取り込んだ。意味を確かめる）")
        m = re.match(r"クリ(?:ティカル)?時\s*", rest)
        if m:
            ctx["when"] = "onCrit"
            rest = rest[m.end():]
        rest = re.sub(r"^(?:常時|発動時)\s*|に常時", lambda mm: "に" if mm.group(0) == "に常時" else "", rest)
        m = re.search(r"自分の失ったHPの(\d+)%を?追加(?:ダメージ)?", rest)
        if m:
            e = {"type": "damage", "bonusSelfLostHpPct": num(m.group(1))}
            e.update(main_target or {"target": "enemy_single"})
            skill.effects.append(e)
            rest = rest[:m.start()] + rest[m.end():]
        m = re.match(r"通常命中で(\d+)%の確率で", rest)
        if m:
            ctx["chance"] = num(m.group(1)); ctx["when"] = "afterHit"
            rest = rest[m.end():]

        # 確率
        m = re.match(r"(?:通常)?(命中[後時])?(?:(\d+)%で)", rest)
        if m:
            ctx["chance"] = num(m.group(2))
            if m.group(1):
                ctx["when"] = "afterHit"
            rest = rest[m.end():]
        else:
            m = re.match(r"(?:通常)?命中[後時]", rest)
            if m:
                ctx["when"] = "afterHit"
                rest = rest[m.end():]

        # 対象（1つの区切りに2つ出ることがある：「味方全体3秒」など）
        for pat, tgt, grp in TARGET_PATTERNS:
            m = re.search(pat, rest)
            if m:
                seg_target = {"target": tgt}
                if grp:
                    seg_target["element"] = ELEMENT[m.group(grp)]
                rest = rest[:m.start()] + " " + rest[m.end():]
                break
        if isinstance(seg_target, str):
            seg_target = {"target": seg_target}
        if seg_target:
            ctx["target"] = seg_target

        # ゲージ
        for m in re.finditer(r"(対象の)?必殺ゲージを?(%s)秒?(進める|戻す)" % NUM, rest):
            sec = num(m.group(2)) * (1 if m.group(3) == "進める" else -1)
            if m.group(3) == "進める":
                tgt = ctx["target"] or {"target": "self"}
            else:
                tgt = {"target": "target"} if not ctx["target"] or ctx["target"]["target"].startswith(("ally", "self")) else ctx["target"]
            e = {"type": "gaugeShift", "sec": sec}
            e.update(tgt)
            add_common(e, ctx, seg_cond)
            skill.effects.append(e)
        rest = re.sub(r"(対象の)?必殺ゲージを?%s秒?(進める|戻す)" % NUM, "", rest)

        # 解除
        if re.search(r"デバフ(?:全)?解除", rest):
            e = {"type": "cleanse"}
            e.update(ctx["target"] if ctx["target"] and ctx["target"]["target"].startswith(("ally", "self")) else {"target": "ally_all"})
            add_common(e, ctx, seg_cond)
            skill.effects.append(e)
            rest = re.sub(r"(?:の)?デバフ(?:全)?解除", "", rest)
        if re.search(r"バフ全解除", rest):
            e = {"type": "dispel"}
            e.update(main_target or {"target": "target"})
            add_common(e, ctx, seg_cond)
            skill.effects.append(e)
            rest = rest.replace("バフ全解除", "")

        # 失ったHPに応じた追加ダメージ
        m = re.search(r"自分の失ったHPの(\d+)%を?追加(?:ダメージ)?", rest)
        if m:
            e = {"type": "damage", "bonusSelfLostHpPct": num(m.group(1))}
            e.update(main_target or {"target": "enemy_single"})
            skill.effects.append(e)
            rest = rest[:m.start()] + rest[m.end():]

        # 回復
        m = re.search(r"(?:攻撃力の?)?(%s)%%回復" % NUM, rest)
        if m:
            e = {"type": "heal", "multiplierPct": num(m.group(1))}
            e.update(ctx["target"] or {"target": "self"})
            add_common(e, ctx, seg_cond, with_duration=False)
            skill.effects.append(e)
            rest = rest[:m.start()] + rest[m.end():]

        # 秒数（「3秒」）。効果の前に置かれる
        m = re.search(r"(%s)秒" % NUM, rest)
        if m:
            ctx["duration"] = num(m.group(1))
            rest = rest[:m.start()] + " " + rest[m.end():]

        # ダメージ倍率
        m = re.search(r"(追加|さらに)?(%s)%%" % NUM, rest)
        if m:
            e = {"type": "damage", "multiplierPct": num(m.group(2))}
            tgt = ctx["target"] if ctx["target"] and ctx["target"]["target"].startswith("enemy") else None
            if m.group(1):
                e["bonus"] = True
                e.update(main_target or tgt or {"target": "enemy_single"})
                if seg_cond:
                    e["if"] = seg_cond
                elif ctx["chance"] is not None and kind != "normal":
                    e["chancePct"] = ctx["chance"]
            else:
                e.update(tgt or {"target": "enemy_single"})
                if main_target is None:
                    main_target = {k: v for k, v in e.items() if k in ("target", "element")}
                if ctx["chance"] is not None and not first:
                    e["chancePct"] = ctx["chance"]
            skill.effects.append(e)
            rest = rest[:m.start()] + rest[m.end():]

        # 特殊な書き方
        if "天竜の加護" in rest:
            e = {"type": "applyBuff", "buffId": "blessing_regen", "tier": "supreme"}
            e.update(ctx["target"] or {"target": "ally_all"})
            add_common(e, ctx, seg_cond)
            skill.effects.append(e)
            rest = re.sub(r"[「」]?天竜の加護[「」]?", "", rest)
        m = re.search(r"ダメージ反射(\d+)%シールド", rest)
        if m:
            e = {"type": "reflect", "pct": num(m.group(1)), "target": "self"}
            add_common(e, ctx, seg_cond)
            skill.effects.append(e)
            skill.issue("反射シールド（仕様に定義なし）")
            rest = rest[:m.start()] + rest[m.end():]
        if "クリティカルシールド" in rest:
            skill.issue("「クリティカルシールド」（仕様に定義なし。シールドとして取り込んだ）")
            rest = rest.replace("クリティカルシールド", "シールド")
        if "防御系ダウン" in rest:
            skill.issue("「防御系ダウン」（どの能力か不明。防御力ダウンとして取り込んだ）")
            rest = rest.replace("防御系ダウン", "防御ダウン")

        rest = parse_buff_tokens(rest, ctx, seg_cond, main_target, skill)

        leftover = re.sub(r"[\s・に、をのでが]+", "", rest)
        if leftover:
            skill.issue("読めなかった部分: 「%s」（元の区切り: %s）" % (leftover, seg))
        first = False


def add_common(e, ctx, cond, with_duration=True):
    if with_duration and ctx["duration"] is not None and e["type"] not in ("gaugeShift", "cleanse", "dispel", "heal", "damage"):
        e["durationSec"] = ctx["duration"]
    if ctx["chance"] is not None:
        e["chancePct"] = ctx["chance"]
    if ctx["when"]:
        e["when"] = ctx["when"]
    if cond:
        e["if"] = cond


TOKEN = re.compile(
    r"(?:【(最上級|上級|中級|下級)】)?"
    r"(?:(?P<stats>(?:%s)(?:[・](?:%s))*)(?P<dir>アップ|ダウン)|(?P<status>%s))"
    r"(?:[（(](最上級|上級|中級|下級)[）)])?" % (STAT_RE, STAT_RE, STATUS_RE))


def parse_buff_tokens(rest, ctx, cond, main_target, skill):
    out = rest
    for m in TOKEN.finditer(rest):
        tier = BUFF_TIER.get(m.group(1) or m.group(m.lastindex if False else 5))
        ids = []
        if m.group("stats"):
            suffix = "_up" if m.group("dir") == "アップ" else "_down"
            for name in re.findall(STAT_RE, m.group("stats")):
                ids.append((STAT_ID[name] + suffix, suffix == "_down"))
        else:
            sid = STATUS_ID[m.group("status")]
            ids.append((sid, sid in DEBUFF_STATUS))
        for bid, is_debuff in ids:
            e = {"type": "applyBuff", "buffId": bid}
            if bid not in TIERLESS:
                e["tier"] = tier
                if tier is None:
                    skill.issue("段階（最上級など）が書かれていないバフ: " + bid)
            tgt = ctx["target"]
            if is_debuff:
                if tgt is None or tgt["target"].startswith(("ally", "self")):
                    tgt = main_target or {"target": "target"}
            else:
                if tgt is None or tgt["target"].startswith("enemy") or tgt["target"] in ("target", "attacker"):
                    if tgt is not None and skill.trigger and skill.trigger["type"] != "always":
                        pass
                    tgt = {"target": "self"}
                    skill.issue("バフの対象が書かれていない（自分として取り込んだ）: " + bid)
            e.update(tgt)
            add_common(e, ctx, cond)
            if ctx["duration"] is None and not (skill.trigger and skill.trigger["type"] == "always"):
                skill.issue("効果時間が書かれていない: " + bid)
            skill.effects.append(e)
        out = out.replace(m.group(0), "", 1)
    return out


# ---------------------------------------------------------------- 凸による変化

def split_ranks(rank_text, skill):
    """「1凸120% 7凸150%」「160/190%」などを、2段階ぶんの数値の列にする。"""
    t = rank_text.strip()
    if not t:
        return None
    if re.search(r"最上級|上級|中級|下級", t):
        skill.issue("凸で段階が変わる（数値ではないので手で入れる）: " + t)
    if "変化の記載なし" in t:
        m = re.search(r"推定[:：](.+?)[）)]?$", t)
        skill.issue("凸の変化が元資料に無い（推定値を取り込んだ）: " + t)
        t = m.group(1).replace("／", "/") if m else ""
    t = COMMENT_PAREN.sub("", t)
    if "凸" in t:
        parts = re.split(r"\d+凸", t)[1:]
        marks = re.findall(r"(\d+)凸", t)
        if len(parts) == 1 and marks[0] in ("7", "9", "11"):
            parts = ["", parts[0]]  # 2段階目だけ書かれている
    else:
        parts = t.split("/")
    if len(parts) != 2:
        skill.issue("凸の変化が2段階に分けられない: " + rank_text.strip())
        return None
    stages = []
    for p in parts:
        stages.append([(num(v), u) for v, u in re.findall(r"(%s)(%%|秒)?" % NUM, p)])
    # 「160/190%」のように片方だけ単位がある場合は、もう片方から借りる
    if len(stages[0]) == len(stages[1]):
        for i in range(len(stages[0])):
            u0, u1 = stages[0][i][1], stages[1][i][1]
            if not u0 and u1:
                stages[0][i] = (stages[0][i][0], u1)
            if not u1 and u0:
                stages[1][i] = (stages[1][i][0], u0)
    return stages


def apply_ranks(skill, stages):
    if stages is None:
        return
    pct_slots = []   # (effect, key)
    for e in skill.effects:
        for key in ("multiplierPct", "bonusSelfLostHpPct"):
            if key in e:
                pct_slots.append((e, key))
    dur_effects = [e for e in skill.effects if "durationSec" in e]
    gauge_effects = [e for e in skill.effects if e["type"] == "gaugeShift"]

    def classify(stage):
        pcts, durs, gauges = [], [], []
        for v, u in stage:
            if u == "%":
                pcts.append(v)
            elif u == "秒" and v >= 2:
                durs.append(v)
            elif (u == "秒" or u == "") and v < 2:
                gauges.append(v)
            elif u == "" and v >= 2:
                # 単位なしの大きい数：％の枠が残っていれば％、なければ秒
                (pcts if pct_slots and not dur_effects else durs if dur_effects and not pct_slots else pcts).append(v)
            else:
                durs.append(v)
        return pcts, durs, gauges

    c1, c2 = classify(stages[0]), classify(stages[1])

    def series(kind_idx, i):
        a = c1[kind_idx][i] if i < len(c1[kind_idx]) else None
        b = c2[kind_idx][i] if i < len(c2[kind_idx]) else None
        return a, b

    def set_rank(e, key, a, b, sign=1):
        base = e[key]
        if isinstance(base, list):
            return
        r1 = base if a is None else a * sign
        r2 = r1 if b is None else b * sign
        if not (abs(base) <= abs(r1) <= abs(r2)):
            skill.issue("凸の値が増えていない: %s %s → %s → %s" % (key, base, r1, r2))
        e[key] = [base, r1, r2]

    # ％
    n_pct = max(len(c1[0]), len(c2[0]))
    if n_pct:
        if not pct_slots:
            skill.issue("凸で変わる％の行き先がない")
        elif n_pct == 1 and len(pct_slots) > 1:
            a, b = series(0, 0)
            base = pct_slots[0][0][pct_slots[0][1]]
            for e, key in pct_slots:
                if e[key] == base:
                    set_rank(e, key, a, b)
        else:
            for i in range(n_pct):
                if i >= len(pct_slots):
                    skill.issue("凸で変わる％が枠より多い")
                    break
                a, b = series(0, i)
                set_rank(pct_slots[i][0], pct_slots[i][1], a, b)
    # 秒
    n_dur = max(len(c1[1]), len(c2[1]))
    if n_dur:
        if not dur_effects:
            skill.issue("凸で変わる秒数の行き先がない")
        else:
            if n_dur > 1:
                skill.issue("凸で変わる秒数が2つ以上ある（最初の1つだけ取り込んだ）")
            a, b = series(1, 0)
            base = dur_effects[0]["durationSec"]
            for e in dur_effects:
                if e["durationSec"] == base:
                    set_rank(e, "durationSec", a, b)
                elif not isinstance(e["durationSec"], list):
                    skill.issue("効果時間が複数ある（凸で伸びるのがどれかを確かめる）")
    # ゲージ
    n_g = max(len(c1[2]), len(c2[2]))
    if n_g:
        if not gauge_effects:
            skill.issue("凸で変わる小さい数（ゲージ？）の行き先がない")
        else:
            a, b = series(2, 0)
            for e in gauge_effects:
                set_rank(e, "sec", a, b, sign=1 if e["sec"] > 0 else -1)


def parse_skill(sid, kind, text):
    skill = Skill(sid, kind)
    text = text.replace("\\[", "[").replace("\\]", "]")
    body, _, rank = text.partition("／")
    body = strip_comments(body, skill)
    skill.trigger, rest = parse_trigger(kind, body, skill)
    parse_segments(kind, rest, skill)
    if not skill.effects:
        skill.issue("効果が1つも読めなかった")
    if kind in ("normal", "ultimate") and not any(e["type"] in ("damage", "heal") for e in skill.effects):
        skill.issue("ダメージも回復も無い")
    apply_ranks(skill, split_ranks(rank, skill))
    return skill


# ---------------------------------------------------------------- 文書の読み取り

HEAD = re.compile(r"^### C(\d{3}) (.+?)（([勇技心知])・(近距離|遠距離|防御|回復|妨害)）")
LINE = re.compile(r"^- (通常|特殊|必殺|6凸魔晶|凸ステ|N|S|U|L|T|元SR版)(?:（[^）]*）)?(?:\\\[(.+?)\\\])?\s*[:：]\s*(.*)$")
KIND = {"通常": "normal", "N": "normal", "特殊": "special", "S": "special", "必殺": "ultimate", "U": "ultimate",
        "6凸魔晶": "crystal", "L": "crystal", "凸ステ": "substat", "T": "substat"}
STARS = [2, 4, 8, 10]


def parse_substats(text, issues):
    out = []
    if "標準" in text:
        issues.append("凸ステが元資料に無い（同じ型の標準値を取り込んだ）")
        text = re.sub(r"^.*?標準[（(]", "", text)
        text = re.sub(r"[）)].*$", "", text)
    parts = [p.strip() for p in text.split(",") if p.strip()]
    for i, p in enumerate(parts):
        m = re.match(r"(\d+)?\s*(命中|回避|クリ率|クリ耐性|クリダメ|クリ防御)\+(%s)" % NUM, p)
        if not m or i >= 4:
            issues.append("凸ステが読めない: " + p)
            continue
        star = int(m.group(1)) if m.group(1) else STARS[i]
        out.append({"star": star, "stat": SUBSTAT[m.group(2)], "value": num(m.group(3))})
    if len(out) != 4:
        issues.append("凸ステが4つではない")
    return out


def main():
    lines = io.open(SRC, encoding="utf-8").read().split("\n")
    table = {}
    for ln in lines:
        m = re.match(r"^\| C(\d{3}) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \|", ln)
        if m:
            table[m.group(1)] = {"name": m.group(2), "kaku": m.group(3), "element": m.group(4),
                                 "role": m.group(5), "original": m.group(6)}
    chars, skills, crystals, text, sourcemap, report = [], [], [], {}, {}, []
    cur = None
    char_issues = {}

    def flush():
        if cur:
            chars.append(cur["char"])

    for ln in lines:
        m = HEAD.match(ln)
        if m:
            flush()
            n = m.group(1)
            cid = "chr_" + n
            row = table.get(n)
            issues = []
            if not row:
                issues.append("一覧表に無い")
                row = {"name": m.group(2), "kaku": "?", "original": ""}
            if row["name"] != m.group(2):
                issues.append("一覧表と見出しで名前が違う")
            role = ROLE[m.group(4)]
            cur = {"n": n, "char": {
                "id": cid, "tier": TIER_OF_KAKU.get(row["kaku"]), "element": ELEMENT[m.group(3)], "role": role,
                "type": ROLE_TYPE[role],
                "skills": {"normal": None, "special": None, "ultimate": None},
                "substatBonuses": [], "crystalId": None,
                "obtain": "boss_first_clear" if row["kaku"] == "LR" else "gacha",
                "assetIds": {"portrait": "art.%s.portrait" % cid, "icon": "art.%s.icon" % cid, "battle": "art.%s.battle" % cid},
            }}
            text[cid + ".name"] = row["name"]
            sourcemap[cid] = {"name": row["original"], "skills": {}}
            char_issues[cid] = issues
            continue
        if not cur:
            continue
        m = LINE.match(ln)
        if not m:
            if ln.startswith("- "):
                char_issues[cur["char"]["id"]].append("読めない行: " + ln)
            continue
        label, orig_name, body = m.group(1), m.group(2), m.group(3)
        if label == "元SR版":
            continue
        kind = KIND[label]
        cid = cur["char"]["id"]
        if kind == "substat":
            cur["char"]["substatBonuses"] = parse_substats(body, char_issues[cid])
            continue
        suffix = {"normal": "n", "special": "s", "ultimate": "u"}.get(kind)
        sid = ("skl_%s_%s" % (cid, suffix)) if suffix else "cry_" + cid
        sk = parse_skill(sid, kind, body)
        if orig_name:
            sourcemap[cid]["skills"][kind] = orig_name
        item = {"id": sid, "kind": kind, "trigger": sk.trigger, "effects": sk.effects}
        if kind == "crystal":
            item["ownerId"] = cid
            item["slot"] = "rainbow" if cur["char"]["tier"] == "lr" else "normal"
            cur["char"]["crystalId"] = sid
            crystals.append(item)
        else:
            cur["char"]["skills"][kind] = sid
            skills.append(item)
        if sk.issues:
            item["needsReview"] = True
            report.append((cid, text[cid + ".name"], sid, ln, sk.issues))
    flush()

    for c in chars:
        iss = char_issues[c["id"]]
        for k, v in c["skills"].items():
            if v is None:
                iss.append("スキルが無い: " + k)
        if c["crystalId"] is None:
            iss.append("魔晶が無い")
        if c["tier"] is None:
            iss.append("格が読めない")

    def dump(path, obj):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with io.open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write("\n")

    dump(os.path.join(OUT_JSON, "characters.json"), {"schemaVersion": 1, "items": chars})
    dump(os.path.join(OUT_JSON, "skills.json"), {"schemaVersion": 1, "items": skills})
    dump(os.path.join(OUT_JSON, "crystals.json"), {"schemaVersion": 1, "items": crystals})
    ja_path = os.path.join(OUT_JSON, "text", "ja.json")
    ja = {}
    if os.path.exists(ja_path):
        ja = json.load(io.open(ja_path, encoding="utf-8"))
    ja.update(text)
    dump(ja_path, dict(sorted(ja.items())))
    dump(SOURCEMAP, sourcemap)

    total = len(skills) + len(crystals)
    flagged = len(report)
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with io.open(REPORT, "w", encoding="utf-8", newline="\n") as f:
        f.write("# 取り込みレポート\n\n")
        f.write("キャラ %d 体、スキルと魔晶 %d 件。そのうち確認が要るもの %d 件（needsReview）。\n\n" % (len(chars), total, flagged))
        counts = {}
        for _, _, _, _, iss in report:
            for i in iss:
                key = re.split(r"[:：（]", i)[0]
                counts[key] = counts.get(key, 0) + 1
        f.write("## 理由ごとの件数\n\n| 理由 | 件数 |\n|---|---|\n")
        for k, v in sorted(counts.items(), key=lambda x: -x[1]):
            f.write("| %s | %d |\n" % (k, v))
        f.write("\n## キャラ単位の問題\n\n")
        any_c = False
        for cid, iss in char_issues.items():
            for i in iss:
                any_c = True
                f.write("- %s: %s\n" % (cid, i))
        if not any_c:
            f.write("なし\n")
        f.write("\n## スキル単位\n\n")
        for cid, name, sid, ln, iss in report:
            f.write("### %s（%s）\n\n元の行: `%s`\n\n" % (sid, name, ln.replace("`", "'")))
            for i in iss:
                f.write("- %s\n" % i)
            f.write("\n")
    print("characters=%d skills=%d crystals=%d needsReview=%d" % (len(chars), len(skills), len(crystals), flagged))
    return 0


if __name__ == "__main__":
    sys.exit(main())
