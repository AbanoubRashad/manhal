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
      ['Nour, the AI study mentor', 'Nour is an AI. Its answers come from course material and can still be wrong or incomplete, so check anything important with your instructor. Nour does not give checkpoint quiz answers, and an answer from Nour is never the instructor\'s answer unless the instructor has checked it. Use Nour for studying only, and don\'t try to make it break these rules.'],
      ['Changes', 'We may update these terms. We will tell you by email before changes that affect you take effect.'],
    ],
    ar: [
      ['استخدام منهل', 'بإنشاء حساب فأنت توافق على استخدام منهل لتعلّمك الشخصي، والحفاظ على سرية كلمة مرورك، وعدم مشاركة محتوى الدورات المدفوعة خارج المنصة.'],
      ['الدورات والمدرّبون', 'يملك المدرّبون محتوى دوراتهم ويمنحون منهل ترخيصًا لبيعه وعرضه. يحق لمنهل حذف الدورات المخالفة لهذه الشروط أو للقانون.'],
      ['الدفع', 'الأسعار بالجنيه المصري وتشمل أي ضرائب مطبّقة. يعالج مزوّد الدفع المدفوعات، ولا يحتفظ منهل ببيانات البطاقات.'],
      ['الشهادات', 'تؤكد الشهادات إتمامك لدورة على منهل، وليست مؤهلات أكاديمية معتمدة ما لم تذكر الدورة غير ذلك.'],
      ['نور، المرشدة الدراسية بالذكاء الاصطناعي', 'نور ذكاء اصطناعي. إجاباتها مبنية على مادة الدورة لكنها قد تكون خاطئة أو ناقصة، فراجع أي أمر مهم مع المدرّب. لا تعطي نور إجابات اختبارات التحقق، وإجابتها ليست إجابة المدرّب ما لم يراجعها. استخدم نور للمذاكرة فقط، ولا تحاول دفعها لمخالفة هذه القواعد.'],
      ['التعديلات', 'قد نحدّث هذه الشروط، وسنبلغك بالبريد قبل سريان أي تغيير يخصك.'],
    ],
  },
  privacy: {
    en: [
      ['What we collect', 'Your name, email address, password (stored as a one-way hash), your course progress, notes and quiz results, and your order history.'],
      ['Why we collect it', 'To run your account, show your progress, issue certificates, send receipts and account emails, and pay instructors.'],
      ['Who we share it with', 'Our payment provider (to take payments), our email provider (to send emails) and our video provider (to stream lessons). We do not sell your data.'],
      ['Nour, the AI study mentor', 'When you use Nour, we store your messages and Nour\'s replies for 90 days, then delete them automatically. You can see and delete them at any time in Account → Your Nour conversations. Your messages and the relevant course material are processed by our AI provider (Anthropic) to write replies; we send your first name only, never your email, phone or payment details. We also keep usage records (number of messages and cost, without the text) to run the service. AI answers can be wrong. Optional study nudges can be turned off in Account → Mentor settings or with the link in any nudge email.'],
      ['Learners under 18', 'If you tell us your birth year and you are under 18, nudges stay gentle and Nour stays strictly on study topics. You can add a parent, who gets a weekly summary of lessons, study minutes and quiz scores after confirming their email. The summary never includes your chats.'],
      ['Your choices', 'You can update your profile at any time and ask us to export or delete your data by email.'],
      ['Cookies', 'We use one essential cookie to keep you signed in. We do not use advertising cookies.'],
    ],
    ar: [
      ['ما نجمعه', 'اسمك وبريدك الإلكتروني وكلمة مرورك (مخزّنة بشكل مشفّر لا يمكن عكسه)، وتقدّمك في الدورات وملاحظاتك ونتائج اختباراتك، وسجل طلباتك.'],
      ['لماذا نجمعه', 'لتشغيل حسابك، وعرض تقدّمك، وإصدار الشهادات، وإرسال الإيصالات ورسائل الحساب، وصرف أرباح المدرّبين.'],
      ['مع من نشاركه', 'مزوّد الدفع (لتحصيل المدفوعات)، ومزوّد البريد (لإرسال الرسائل)، ومزوّد الفيديو (لعرض الدروس). لا نبيع بياناتك.'],
      ['نور، المرشدة الدراسية بالذكاء الاصطناعي', 'عند استخدامك نور نحفظ رسائلك وردودها لمدة 90 يومًا ثم نحذفها تلقائيًا، ويمكنك الاطلاع عليها وحذفها في أي وقت من الحساب ← محادثاتك مع نور. يعالج مزوّد الذكاء الاصطناعي لدينا (Anthropic) رسائلك ومادة الدورة ذات الصلة لكتابة الردود، ولا نرسل إلا اسمك الأول، ولا نرسل بريدك أو هاتفك أو بيانات الدفع أبدًا. ونحتفظ بسجلات استخدام (عدد الرسائل والتكلفة دون النص) لتشغيل الخدمة. قد تكون إجابات الذكاء الاصطناعي خاطئة. ويمكنك إيقاف تذكيرات المذاكرة الاختيارية من الحساب ← إعدادات المرشد أو من الرابط في أي رسالة تذكير.'],
      ['المتعلّمون أقل من 18 عامًا', 'إذا أخبرتنا بسنة ميلادك وكنت أقل من 18 عامًا، تبقى التذكيرات هادئة وتلتزم نور بموضوعات المذاكرة فقط. ويمكنك إضافة ولي أمر يصله بعد تأكيد بريده ملخص أسبوعي بالدروس ودقائق المذاكرة ونتائج الاختبارات، ولا يتضمن محادثاتك أبدًا.'],
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
