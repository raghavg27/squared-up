import { LegalLayout, Section } from './LegalLayout.js';

// General terms of use. Framed to protect the operator: the app is an expense
// record + UPI intent builder, "as is", with no money movement and no
// responsibility for settlements between users. Names no legal entity.
export function Terms() {
  return (
    <LegalLayout title="Terms of Agreement" updated="9 July 2026">
      <Section heading="Acceptance">
        <p>
          These terms govern your use of Squared Up ("the app"). By signing in or
          using the app, you agree to them. If you do not agree, please do not use
          the app.
        </p>
      </Section>

      <Section heading="Who can use the app">
        <p>
          You must be at least 18 years old and able to enter into a binding
          agreement. You are responsible for keeping your phone and account secure
          and for all activity under your account.
        </p>
      </Section>

      <Section heading="What the app is — and isn't">
        <p>
          Squared Up is a tool to record shared expenses, calculate balances
          between friends, and generate UPI payment requests. It is not a bank,
          wallet, payment processor or financial institution. We do not hold,
          transfer or settle money. Every actual payment happens in your own UPI
          app, which you control.
        </p>
      </Section>

      <Section heading="Your responsibilities">
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>Provide accurate information and keep it up to date.</li>
          <li>Before paying, verify the recipient and amount in your UPI app — payments you approve are final and are between you and the other person.</li>
          <li>Resolve any disagreement about who owes what directly with the other people involved.</li>
          <li>Use the app only for lawful purposes and not to harass, defraud or harm others.</li>
        </ul>
      </Section>

      <Section heading="Balances are records, not advice">
        <p>
          Amounts and balances shown are based on the information you and others
          enter. They are for your convenience and are not financial, tax or legal
          advice. We are not a party to the underlying debts between users.
        </p>
      </Section>

      <Section heading="Service provided “as is”">
        <p>
          The app is provided "as is" and "as available", without warranties of
          any kind, whether express or implied. We do not guarantee that it will be
          uninterrupted, error-free, or that calculations are free of mistakes.
        </p>
      </Section>

      <Section heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, we are not liable for any
          indirect, incidental or consequential loss, or for any loss arising from
          payments you make, errors in amounts, or your inability to use the app.
          Your use of the app is at your own risk.
        </p>
      </Section>

      <Section heading="Indemnity">
        <p>
          You agree to hold us harmless from any claims or costs arising out of your
          use of the app or your breach of these terms.
        </p>
      </Section>

      <Section heading="Suspension and termination">
        <p>
          We may suspend or end access to the app at any time, including for misuse.
          You may stop using the app and request deletion of your account at any
          time.
        </p>
      </Section>

      <Section heading="Changes to these terms">
        <p>
          We may update these terms from time to time. Continued use of the app
          after an update means you accept the revised terms.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          For any question about these terms, reach us through the app's support or
          feedback option.
        </p>
      </Section>
    </LegalLayout>
  );
}
