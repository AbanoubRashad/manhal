import { store, t } from '../state.js';
import { app, footer } from '../ui.js';

// Placeholder policies. Replace with text reviewed by a lawyer before launch.
const PAGES = {
  terms: {
    en: [
      ['Using Manhal', 'By creating an account you agree to use Manhal for your own learning, keep your password private, and not share paid course content outside the platform.'],
      ['Courses and instructors', 'Instructors own their course content and grant Manhal a licence to sell and stream it. Manhal may remove courses that break these terms or the law.'],
      ['Payments', 'Prices are shown in Egyptian pounds and include any applicable taxes. Payments are processed by our payment provider; Manhal never stores card details.'],
      ['Certificates', 'Certificates confirm that you completed a course on Manhal. They are not accredited academic qualifications unless a course says otherwise.'],
      ['Changes', 'We may update these terms. We will tell you by email before changes that affect you take effect.'],
    ],
    ar: [
      ['استخدام منهل', 'بإنشاء حساب فأنت توافق على استخدام منهل لتعلّمك الشخصي، والحفاظ على سرية كلمة مرورك، وعدم مشاركة محتوى الدورات المدفوعة خارج المنصة.'],
      ['الدورات والمدرّبون', 'يملك المدرّبون محتوى دوراتهم ويمنحون منهل ترخيصًا لبيعه وعرضه. يحق لمنهل حذف الدورات المخالفة لهذه الشروط أو للقانون.'],
      ['الدفع', 'الأسعار بالجنيه المصري وتشمل أي ضرائب مطبّقة. يعالج مزوّد الدفع المدفوعات، ولا يحتفظ منهل ببيانات البطاقات.'],
      ['الشهادات', 'تؤكد الشهادات إتمامك لدورة على منهل، وليست مؤهلات أكاديمية معتمدة ما لم تذكر الدورة غير ذلك.'],
      ['التعديلات', 'قد نحدّث هذه الشروط، وسنبلغك بالبريد قبل سريان أي تغيير يخصك.'],
    ],
  },
  privacy: {
    en: [
      ['What we collect', 'Your name, email address, password (stored as a one-way hash), your course progress, notes and quiz results, and your order history.'],
      ['Why we collect it', 'To run your account, show your progress, issue certificates, send receipts and account emails, and pay instructors.'],
      ['Who we share it with', 'Our payment provider (to take payments), our email provider (to send emails) and our video provider (to stream lessons). We do not sell your data.'],
      ['Your choices', 'You can update your profile at any time and ask us to export or delete your data by email.'],
      ['Cookies', 'We use one essential cookie to keep you signed in. We do not use advertising cookies.'],
    ],
    ar: [
      ['ما نجمعه', 'اسمك وبريدك الإلكتروني وكلمة مرورك (مخزّنة بشكل مشفّر لا يمكن عكسه)، وتقدّمك في الدورات وملاحظاتك ونتائج اختباراتك، وسجل طلباتك.'],
      ['لماذا نجمعه', 'لتشغيل حسابك، وعرض تقدّمك، وإصدار الشهادات، وإرسال الإيصالات ورسائل الحساب، وصرف أرباح المدرّبين.'],
      ['مع من نشاركه', 'مزوّد الدفع (لتحصيل المدفوعات)، ومزوّد البريد (لإرسال الرسائل)، ومزوّد الفيديو (لعرض الدروس). لا نبيع بياناتك.'],
      ['اختياراتك', 'يمكنك تعديل ملفك في أي وقت، وطلب تصدير بياناتك أو حذفها عبر البريد.'],
      ['ملفات تعريف الارتباط', 'نستخدم ملفًا أساسيًا واحدًا لإبقائك مسجّلًا. لا نستخدم ملفات إعلانية.'],
    ],
  },
  refunds: {
    en: [
      ['14-day refunds', 'If a paid course is not right for you, ask for a refund within 14 days of purchase and before completing more than 30% of it.'],
      ['How to ask', 'Email us with your order number from the Orders page. We reply within 3 working days.'],
      ['What happens next', 'We refund the amount you paid to the original payment method. Banks usually take 5 to 14 days to show it. Access to the refunded course ends.'],
      ['Exceptions', 'We may refuse refunds where we see abuse, such as repeated purchases and refunds of the same course.'],
    ],
    ar: [
      ['الاسترداد خلال 14 يومًا', 'إذا لم تناسبك دورة مدفوعة، اطلب الاسترداد خلال 14 يومًا من الشراء وقبل إكمال أكثر من 30% منها.'],
      ['كيف تطلب', 'راسلنا برقم الطلب من صفحة الطلبات، وسنرد خلال 3 أيام عمل.'],
      ['ماذا يحدث بعد ذلك', 'نرد المبلغ المدفوع إلى وسيلة الدفع الأصلية، ويظهر عادة خلال 5 إلى 14 يومًا، وينتهي وصولك إلى الدورة.'],
      ['استثناءات', 'قد نرفض الاسترداد عند إساءة الاستخدام، مثل تكرار شراء الدورة نفسها واستردادها.'],
    ],
  },
};

export function legalPage(m) {
  const key = m[1];
  const sections = PAGES[key][store.lang] || PAGES[key].en;
  app().innerHTML = `<section class="wrap prose"><div class="eyebrow">${t('brand')}</div><h1>${t(key)}</h1>
  <p class="placeholder">${t('legal_placeholder')}</p>
  ${sections.map(([h, p]) => `<h2>${h}</h2><p>${p}</p>`).join('')}
  </section>${footer()}`;
}
