/**
 * Raksha Tab — Know Your Rights Page
 *
 * Educational content about the POSH Act 2013 presented in a
 * warm, approachable way. Uses progressive disclosure (expandable
 * sections) so users aren't overwhelmed with legal text upfront.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown20Regular,
  ShieldCheckmark24Regular,
  Warning24Filled,
  People24Regular,
  Clock24Regular,
  QuestionCircle24Regular,
  AlertBadge24Regular,
} from "@fluentui/react-icons";

const fadeUp = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

export function KnowYourRights() {
  return (
    <div className="min-h-screen">
      {/* Header — simple, clean */}
      <section className="max-w-5xl mx-auto px-5 pt-12 pb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheckmark24Regular className="w-5 h-5 text-violet-600" />
            <span className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">Legal Information</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Know Your Rights
          </h1>
          <p className="mt-2 text-base text-gray-500 max-w-lg leading-relaxed">
            Understanding the law is the first step to protecting yourself.
            Here's what every employee should know — in plain language.
          </p>
        </motion.div>
      </section>

      <div className="max-w-5xl mx-auto px-5 pb-16">
        {/* Section 1: What is Harassment */}
        <ContentSection
          icon={<AlertBadge24Regular className="w-5 h-5 text-violet-600" />}
          title="What Counts as Sexual Harassment?"
          subtitle="Under the POSH Act, 2013"
        >
          <p className="text-gray-600 leading-relaxed mb-4">
            The law defines sexual harassment as any <strong>unwelcome</strong> act or behaviour including:
          </p>
          <div className="space-y-2.5 mb-5">
            {[
              "Physical contact and advances",
              "A demand or request for sexual favours",
              "Making sexually coloured remarks",
              "Showing pornography",
              "Any other unwelcome physical, verbal, or non-verbal conduct of sexual nature",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[11px] font-bold text-gray-600">{i + 1}</span>
                </div>
                <p className="text-sm text-gray-700">{item}</p>
              </div>
            ))}
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600 leading-relaxed">
              The law also covers <strong>quid pro quo</strong> (threats or promises tied to sexual favours)
              and <strong>hostile work environment</strong> (conduct that makes your workplace intimidating or offensive).
            </p>
          </div>
        </ContentSection>

        {/* Section 2: Criminal Threshold */}
        <ContentSection
          icon={<Warning24Filled className="w-5 h-5 text-red-500" />}
          title="When Does It Become Criminal?"
          badge="BNS 2023"
          badgeColor="red"
        >
          <p className="text-gray-600 leading-relaxed mb-4">
            Some behaviour goes beyond workplace harassment into criminal territory
            under the <strong>Bharatiya Nyaya Sanhita, 2023</strong>:
          </p>
          <div className="space-y-2.5 mb-4">
            {[
              { section: "Section 74", text: "Assault or criminal force to outrage modesty (1-5 years)" },
              { section: "Section 75", text: "Sexual harassment — physical contact, demand for sexual favours, showing pornography, sexual remarks (up to 3 years)" },
              { section: "Section 76", text: "Assault with intent to disrobe (3-7 years)" },
              { section: "Section 77", text: "Voyeurism — watching or capturing images of private acts (1-3 years, repeat 3-7 years)" },
              { section: "Section 78", text: "Stalking — following, contacting, monitoring despite disinterest (up to 3 years, repeat 5 years)" },
              { section: "Section 79", text: "Word, gesture or act intended to insult modesty (up to 3 years)" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-red-50/50 rounded-lg">
                <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-md shrink-0 mt-0.5">{item.section}</span>
                <p className="text-sm text-gray-700">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="p-4 bg-violet-50 rounded-lg border border-violet-100">
            <p className="text-sm text-violet-700">
              <strong>Rakshak automatically detects</strong> if your account crosses this threshold
              and flags it for the ICC, who are legally obligated to help you file a criminal complaint.
            </p>
          </div>
        </ContentSection>

        {/* Section 3: Employer Obligations */}
        <ContentSection
          icon={<People24Regular className="w-5 h-5 text-violet-600" />}
          title="What Your Employer Must Do"
          subtitle="Under Section 19 of the POSH Act"
        >
          <div className="space-y-2.5 mb-4">
            {[
              "Constitute an Internal Complaints Committee (ICC) — with a woman presiding officer, at least 50% women, and one external NGO member",
              "Display information about the POSH Act at a conspicuous place",
              "Organize awareness programmes",
              "Provide a safe working environment",
              "Assist you in criminal proceedings if you choose to file an FIR",
              "Treat sexual harassment as misconduct under service rules",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 mt-2" />
                <p className="text-sm text-gray-700 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-sm text-amber-800">
              <strong>Non-compliance penalty:</strong> Up to ₹50,000 fine. Repeat offence: double penalty or cancellation of business license.
            </p>
          </div>
        </ContentSection>

        {/* Section 4: Timeline */}
        <ContentSection
          icon={<Clock24Regular className="w-5 h-5 text-violet-600" />}
          title="What Happens After You File?"
          subtitle="Rakshak tracks every deadline automatically"
        >
          <div className="space-y-0">
            <TimelineStep
              label="Day 0"
              title="You file a complaint"
              description="Through a conversation with Rakshak. Your complaint is structured, legally formatted, and submitted to the ICC."
            />
            <TimelineStep
              label="7 days"
              title="ICC must acknowledge"
              description="The ICC receives your complaint and must acknowledge receipt. Rakshak sends reminders if they don't."
            />
            <TimelineStep
              label="Auto"
              title="If ICC doesn't respond"
              description="Rakshak auto-escalates to the Audit Committee. If they also don't respond, it goes to the District Officer."
              highlight
            />
            <TimelineStep
              label="After ack"
              title="Inquiry begins"
              description="The ICC must conduct an inquiry following principles of natural justice. Both parties get to present their case."
            />
            <TimelineStep
              label="90 days"
              title="Inquiry must complete"
              description="The ICC must finish the inquiry and submit a report. Rakshak sends reminders at 60, 75, 85, and 89 days."
            />
            <TimelineStep
              label="60 days"
              title="Employer acts on recommendations"
              description="The employer must act on the ICC's recommendations within 60 days of receiving the report."
              last
            />
          </div>
        </ContentSection>

        {/* Section 5: FAQs */}
        <ContentSection
          icon={<QuestionCircle24Regular className="w-5 h-5 text-violet-600" />}
          title="Frequently Asked Questions"
        >
          <div className="space-y-2">
            <FaqItem question="Will my manager know I filed a complaint?">
              <strong>No.</strong> Your complaint goes directly to the ICC — not to your manager, not to HR.
              The POSH Act (Section 16) requires all proceedings to be confidential.
              Rakshak encrypts your data so even database administrators cannot read your complaint text.
              Breach of confidentiality is a punishable offence under the Act.
            </FaqItem>
            <FaqItem question="Can I be punished for filing a complaint?">
              <strong>No.</strong> The POSH Act prohibits retaliation against complainants.
              If you face victimization for filing a complaint, that itself is a violation of the Act.
              Report any retaliation immediately — it strengthens your case.
            </FaqItem>
            <FaqItem question="What if I don't have evidence?">
              You can still file a complaint. The ICC follows principles of natural justice,
              not criminal court standards. Your testimony is valid evidence.
              Any supporting evidence — screenshots, emails, witness names — strengthens the case,
              but is not required.
            </FaqItem>
            <FaqItem question="How long do I have to file?">
              You must file within <strong>3 months</strong> of the incident (or the last incident
              in a series). The ICC can extend this by another 3 months if circumstances prevented
              timely filing. Don't wait — file as soon as you feel ready. Rakshak saves your progress.
            </FaqItem>
            <FaqItem question="What if the ICC doesn't respond?">
              <strong>This is exactly what Rakshak is built for.</strong> If the ICC doesn't acknowledge
              your complaint within the deadline, Rakshak automatically escalates — first to the
              Audit Committee, then to the District Officer. Every missed deadline is logged.
              No complaint gets buried.
            </FaqItem>
            <FaqItem question="What about false complaints?">
              Section 14 allows action against complaints made with malicious intent. However,
              <strong> a complaint that cannot be proved is NOT the same as a false complaint.</strong>{" "}
              The inability to substantiate a complaint does not make it malicious.
            </FaqItem>
            <FaqItem question="Does the POSH Act cover men?">
              The POSH Act specifically covers women as complainants. However, many company policies
              extend protections to all genders. Rakshak can be configured by your organization
              to accept complaints from all employees regardless of gender.
            </FaqItem>
          </div>
        </ContentSection>

        {/* Disclaimer */}
        <div className="mt-12 text-center">
          <span className="inline-block px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-xs font-medium text-amber-700 mb-2">
            Disclaimer
          </span>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            This information is for awareness purposes only and does not constitute legal advice.
            For specific legal guidance, consult a qualified legal professional.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function ContentSection({
  icon,
  title,
  subtitle,
  badge,
  badgeColor,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: "red" | "violet";
  children: React.ReactNode;
}) {
  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true }}
      className="mt-10 first:mt-6"
    >
      <div className="flex items-center gap-3 mb-1">
        {icon}
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
            badgeColor === "red" ? "bg-red-100 text-red-700" : "bg-violet-100 text-violet-700"
          }`}>
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p className="text-[13px] text-gray-500 mb-4 ml-8">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </motion.section>
  );
}

function TimelineStep({
  label,
  title,
  description,
  highlight,
  last,
}: {
  label: string;
  title: string;
  description: string;
  highlight?: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      {/* Left rail */}
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full shrink-0 mt-1.5 ${
          highlight ? "bg-red-400" : "bg-violet-400"
        }`} />
        {!last && <div className="w-px flex-1 bg-gray-200 mt-1" />}
      </div>

      {/* Content */}
      <div className="pb-6">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
            highlight ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
          }`}>
            {label}
          </span>
        </div>
        <p className="text-[13px] text-gray-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-medium text-gray-800">{question}</span>
        <ChevronDown20Regular
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
