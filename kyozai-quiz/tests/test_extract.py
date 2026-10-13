from kyozai_quiz.extract import extract_slides


def test_text_notes_and_figure_detection(sample_pptx):
    slides = {s.page_number: s for s in extract_slides(sample_pptx)}
    assert len(slides) == 6

    assert "情報セキュリティの基本" in slides[1].text
    assert slides[1].notes == "CIA と呼ばれることを補足する"
    assert not slides[1].has_figure  # プレースホルダーのテキストだけなら図なし

    assert slides[2].figure_kinds == ["shape"]
    assert "インシデント対応の流れ" in slides[2].text and "封じ込め" in slides[2].text
    assert slides[3].figure_kinds == ["picture"]

    assert slides[4].figure_kinds == ["chart"]
    assert "系列「件数」: 12, 30" in slides[4].text  # グラフの数値はファイルから読む（OCR しない）

    assert not slides[5].has_figure  # 表は図ではなくマークダウン表のテキストとして扱う
    assert "| 要素 | 意味 |" in slides[5].text and "| 機密性 | 許可された人だけ |" in slides[5].text

    assert slides[6].hidden
    assert not slides[6].has_figure  # 小さいロゴは図とみなさない
