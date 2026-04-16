/**
 * Rakshak Tab — Home Page
 *
 * The first thing every user sees. Designed to feel safe, not slick.
 * Left-aligned, text-first, with intentional breathing space.
 */

import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChatBubblesQuestion24Regular,
  FolderOpen24Regular,
  BookOpen24Regular,
  ShieldCheckmark24Regular,
  LockClosed20Regular,
  Timer20Regular,
  ArrowRight16Regular,
  ArrowUpRight16Regular,
} from "@fluentui/react-icons";
import { useCurrentUser } from "../context/AuthContext";
import { openBotChat } from "../utils/openBotChat";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

export function Home() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const isIcc = user?.role === "icc";

  return (
    <div className="pb-20">
      {/* ICC member notice */}
      {isIcc && (
        <div className="bg-gray-900 text-white">
          <div className="max-w-5xl mx-auto px-5 py-2.5 flex items-center justify-between">
            <p className="text-[13px]">
              You're signed in as an <strong>ICC member</strong>.
            </p>
            <button
              onClick={() => navigate("/icc")}
              className="text-[13px] font-medium flex items-center gap-1 hover:underline underline-offset-2"
            >
              ICC Dashboard <ArrowRight16Regular />
            </button>
          </div>
        </div>
      )}

      {/* Hero — left-aligned, text-first, minimal */}
      <section className="max-w-5xl mx-auto px-5 pt-14 pb-12">
        <motion.div {...fade} transition={{ duration: 0.3 }}>
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-5">
              <ShieldCheckmark24Regular className="w-5 h-5 text-violet-600" />
              <span className="text-[13px] font-medium text-gray-500 tracking-wide uppercase">Workplace Safety</span>
            </div>

            <h1 className="text-[2rem] sm:text-[2.5rem] font-bold text-gray-900 leading-[1.15] tracking-tight">
              Your workplace should<br className="hidden sm:block" /> feel safe.
            </h1>

            <p className="mt-4 text-base text-gray-500 leading-relaxed max-w-lg">
              Report workplace harassment confidentially. Rakshak structures it into a legal complaint, notifies the ICC, and escalates automatically if they don't act.
            </p>

            <div className="mt-7 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => openBotChat("Hi")}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <ChatBubblesQuestion24Regular className="w-4 h-4" />
                Report a concern
              </button>
              <button
                onClick={() => navigate("/rights")}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
              >
                Learn about your rights
                <ArrowRight16Regular className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Quick actions — divided row, not floating cards */}
      <section className="max-w-5xl mx-auto px-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
          <QuickAction
            icon={<ChatBubblesQuestion24Regular className="w-5 h-5" />}
            title="Report a Concern"
            description="Talk to Rakshak in a private chat. No forms."
            onClick={() => openBotChat("Hi")}
          />
          <QuickAction
            icon={<FolderOpen24Regular className="w-5 h-5" />}
            title="My Cases"
            description="Track status and view your complaint timeline."
            onClick={() => navigate("/cases")}
          />
          <QuickAction
            icon={<BookOpen24Regular className="w-5 h-5" />}
            title="Know Your Rights"
            description="What counts as harassment? What protects you?"
            onClick={() => navigate("/rights")}
          />
        </div>
      </section>

      {/* How it works — numbered list, not card grid */}
      <section className="max-w-5xl mx-auto px-5 mt-16">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { n: "1", title: "Talk to Rakshak", desc: "Share what happened in your own words. One question at a time, no forms." },
            { n: "2", title: "Complaint generated", desc: "Your account is structured into a legally formatted POSH complaint. You review it first." },
            { n: "3", title: "ICC notified", desc: "The Internal Complaints Committee receives your complaint instantly and must acknowledge it." },
            { n: "4", title: "Auto-escalation", desc: "If the ICC doesn't respond, the system escalates to the Audit Committee, then the District Officer." },
          ].map((step) => (
            <div key={step.n}>
              <div className="text-[13px] font-semibold text-violet-600 mb-1.5">Step {step.n}</div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">{step.title}</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust signals — horizontal, not cards */}
      <section className="max-w-5xl mx-auto px-5 mt-16">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Built to protect you</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
          <TrustItem
            icon={<LockClosed20Regular className="w-4 h-4 text-gray-400" />}
            title="End-to-end encrypted"
            description="Your complaint data is encrypted at rest. Your manager, HR, or IT cannot read it."
          />
          <TrustItem
            icon={<ChatBubblesQuestion24Regular className="w-4 h-4 text-gray-400" />}
            title="No forms, just conversation"
            description="Share your story naturally. Rakshak guides you through it — one question at a time."
          />
          <TrustItem
            icon={<Timer20Regular className="w-4 h-4 text-gray-400" />}
            title="Automatic accountability"
            description="Deadlines are tracked. Missed deadlines trigger escalation — ICC → Audit Committee → District Officer."
          />
          <TrustItem
            icon={<ShieldCheckmark24Regular className="w-4 h-4 text-gray-400" />}
            title="Legally structured"
            description="Every complaint cites the correct POSH Act sections. Criminal threshold is flagged automatically."
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-5xl mx-auto px-5 mt-16 pt-10 border-t border-gray-100">
        <div className="max-w-lg">
          <h2 className="text-lg font-semibold text-gray-900">
            Not sure if what happened counts?
          </h2>
          <p className="text-[13px] text-gray-500 mt-2 leading-relaxed">
            Many people aren't sure if their experience qualifies as harassment.
            That's okay — learn about what the POSH Act covers.
          </p>
          <button
            onClick={() => navigate("/rights")}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
          >
            Know Your Rights
            <ArrowUpRight16Regular className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-5 mt-14 pt-6 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          Rakshak (रक्षक) — "protector" in Hindi. Open source. Because complaints shouldn't need courage.
        </p>
      </footer>
    </div>
  );
}

// ── Sub-components ──

function QuickAction({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-3 p-4 bg-white text-left hover:bg-gray-50 transition-colors"
    >
      <span className="text-gray-400 group-hover:text-gray-600 mt-0.5 transition-colors">{icon}</span>
      <div>
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        <p className="text-[13px] text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}

function TrustItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        <p className="text-[13px] text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
