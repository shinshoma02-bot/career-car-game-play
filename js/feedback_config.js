// 問い合わせ(ご意見・不具合)の送り先の設定(2026-10-28)。ここだけ直せば、送り先を変えられる。
// 送り先は Google フォーム(匿名)。作り方は SPEC.md の『問い合わせフォームの作り方』を見る。
//  action : フォームの送信先 URL(https://docs.google.com/forms/d/e/<フォームID>/formResponse)
//  fields : 質問ごとの entry 番号(entry.1234567890)。category=種類 / message=本文 / info=自動で付く情報(ビルド番号・端末の種類)
// action が空の間は、問い合わせ欄に『ただいま準備中』と出て、送れない。
window.FEEDBACK_CONFIG = {
  action: 'https://docs.google.com/forms/d/e/1FAIpQLSdLTQsH2deYgC8R_6hSfAlbVRnPOrSl8JQADxIj84tARG4Yuw/formResponse',
  fields: { category: 'entry.1665306711', message: 'entry.78300691', info: 'entry.1488384687' }
};
