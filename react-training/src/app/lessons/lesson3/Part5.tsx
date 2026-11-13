import { Faq } from '../../../shared/components/Faq';
import { Mistakes } from '../../../shared/components/Mistakes';
import { Section } from '../../../shared/components/Section';
import { Checklist } from '../widgets';
import { CHECKLIST, FAQ, MISTAKES } from './data';

// 第3回 パート5：レビューと失敗例
export function Part5() {
  return (
    <>
      <Section title="レビューで気をつけること" lead="分割されたコードを見るときの確認項目です。AI に書いてもらったコードにも、そのまま使えます。">
        <Checklist items={CHECKLIST} />
      </Section>

      <Section title="よくある失敗と見分け方">
        <Mistakes items={MISTAKES} />
      </Section>

      <Section title="つまずいたら（よくある質問）" lead="引っかかりやすい所を、質問と答えの形でまとめました。気になるものを押して開いてください。">
        <Faq items={FAQ} />
      </Section>
    </>
  );
}
