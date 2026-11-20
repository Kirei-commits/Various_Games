import { Section } from '../../../shared/components/Section';
import { BlueprintBuilder } from '../../../features/blueprint';
import { Checklist } from '../widgets';
import { CHECKLIST } from './data';

// 第4回 パート2：設計図を作る
export function Part2() {
  return (
    <>
      <Section title="設計図を作る" lead="入力すると、下にフォルダ構成図とひな形コードができあがります。内容はこのブラウザに保存されます。">
        <BlueprintBuilder />
      </Section>

      <Section title="できた設計図をレビューする" lead="自動チェックは名前の形しか見ません。中身は、自分の目で確かめます。">
        <Checklist title="✅ 設計図のレビューチェックリスト" items={CHECKLIST} />
      </Section>
    </>
  );
}
