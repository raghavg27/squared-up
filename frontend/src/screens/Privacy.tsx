import { LegalLayout, Section } from './LegalLayout.js';

// General, plain-language privacy notice. Describes only what the app actually
// does (OTP/Google sign-in, expense records, UPI intent links — no money
// movement). Intentionally names no legal entity or jurisdiction.
export function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="9 July 2026">
      <Section heading="Overview">
        <p>
          Squared Up ("the app", "we", "us") helps friends record shared expenses
          and square up using UPI. This policy explains what information we
          collect, why, and the choices you have. By using the app you agree to
          this policy.
        </p>
      </Section>

      <Section heading="Information we collect">
        <p>We only collect what the app needs to work:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>Your mobile number, used to sign you in with a one-time code.</li>
          <li>Your name, and email address if you add one or sign in with Google.</li>
          <li>Basic Google account details (name, email) if you choose Google sign-in.</li>
          <li>Your UPI ID (VPA), only if you enter it so friends can pay you.</li>
          <li>The groups, expenses, splits and notes you create in the app.</li>
          <li>Basic technical data (such as device and log information) needed to run and secure the service.</li>
        </ul>
      </Section>

      <Section heading="How we use it">
        <p>
          To create and secure your account, send sign-in codes, split expenses,
          calculate who owes whom, let friends find you by phone or email, and
          build the <code className="font-currency">upi://</code> payment links you tap to settle up.
        </p>
      </Section>

      <Section heading="We do not move money">
        <p>
          Squared Up is not a bank, wallet or payment provider. We only prepare a
          UPI payment request that opens in your own UPI app — you review and
          approve every payment there. We never hold, transfer or take your money,
          and we do not see your bank or card details.
        </p>
      </Section>

      <Section heading="Who can see your information">
        <p>
          When you join a group, other members can see your name, avatar, any UPI
          ID you added, and the shared balances between you. We do not sell your
          personal information. We may share data with service providers (for
          example hosting and sign-in providers) purely to operate the app, and
          where required by law.
        </p>
      </Section>

      <Section heading="Data retention and deletion">
        <p>
          We keep your information for as long as your account is active. You can
          ask us to delete your account and associated personal data; some records
          may be retained where the law requires it or to resolve disputes.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          We take reasonable measures to protect your information. No method of
          storage or transmission is completely secure, so we cannot guarantee
          absolute security. Keep access to your phone and account safe.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          The app is intended for adults and is not directed at anyone under 18.
          If you believe a minor has provided us information, please contact us so
          we can remove it.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          We may update this policy from time to time. Continued use of the app
          after an update means you accept the revised policy.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          For any privacy question or request, reach us through the app's support
          or feedback option.
        </p>
      </Section>
    </LegalLayout>
  );
}
