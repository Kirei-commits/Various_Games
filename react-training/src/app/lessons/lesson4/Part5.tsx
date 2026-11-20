import { Faq } from '../../../shared/components/Faq';
import { Mistakes } from '../../../shared/components/Mistakes';
import { Section } from '../../../shared/components/Section';
import { FAQ, MISTAKES } from './data';

// 第4回 パート5：よくある失敗
export function Part5() {
  return (
    <>
      <Section title="よくある失敗と見分け方">
        <Mistakes items={MISTAKES} />
      </Section>

      <Section title="つまずいたら（よくある質問）" lead="引っかかりやすい所を、質問と答えの形でまとめました。気になるものを押して開いてください。">
        <Faq items={FAQ} />
      </Section>
    </>
  );
}
