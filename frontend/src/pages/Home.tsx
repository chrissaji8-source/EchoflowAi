import { ArrowDown, ArrowUpRight, Mic, Zap, Shield, Activity, Cpu } from 'lucide-react'
import { Slate } from '../components/bits'
import { Marquee, Reveal, Scene, ScrubText, Shot } from '../components/motion'
import { TLink } from '../components/Nav'
import { PAGES } from '../components/Shell'
import { useReducedMotion } from '../lib/scrub'

const CORNERS = (
  <div className="vf" aria-hidden="true">
    <i />
    <i />
    <i />
    <i />
  </div>
)

function OpeningActions() {
  return (
    <div className="op-actions">
      <TLink to="/assistant" className="btn btn--solid">
        <Mic size={17} aria-hidden="true" /> Launch Live Assistant
      </TLink>
      <TLink to="/how-it-works" className="btn">
        See how it works <ArrowDown size={16} aria-hidden="true" />
      </TLink>
    </div>
  )
}

function Opening() {
  const reduced = useReducedMotion()

  if (reduced) {
    return (
      <section className="opening-static" data-tone="ink" data-chapter="EchoFlow" aria-label="Introduction">
        <div className="wrap opening-static-grid">
          <div>
            <Slate index="Theme 8">CuriousParc 2026</Slate>
            <h1 className="display op-h1">
              Natural conversations <em>don’t wait for turns.</em>
            </h1>
            <p className="lead">
              EchoFlow is a voice-assistant prototype for exploring natural turn-taking. It keeps microphone capture active during playback, detects speech activity, and uses finalized browser transcripts to handle follow-up requests.
            </p>
            <OpeningActions />
          </div>
        </div>
      </section>
    )
  }

  return (
    <Scene steps={8} length={460} tone="ink" className="opening" label="Introduction" chapter="EchoFlow">
      {CORNERS}

      <Shot a={-1} b={0.25} f={0.09} className="op-card">
        <p className="op-word" aria-hidden="true">
          EchoFlow
        </p>
        <p className="op-tagline">Voice assistant prototype</p>
        <p className="op-start" aria-hidden="true">
          Scroll to explore <ArrowDown size={15} />
        </p>
      </Shot>

      <div className="wrap op-grid">
        <div className="op-left">
          <Shot a={0.25} b={0.5} f={0.05} className="op-panel">
            <Slate index="Theme 8">CuriousParc 2026 State Innovation Challenge</Slate>
            <h1 className="display op-h1">
              Natural conversations <em>don’t wait for turns.</em>
            </h1>
            <p className="lead">
              EchoFlow keeps microphone capture active while a reply plays. A lightweight speech detector can lower playback volume, while finalized browser transcripts drive follow-up turns.
            </p>
          </Shot>
          <Shot a={0.5} b={0.75} f={0.05} className="op-panel">
            <p className="op-slug">Problem Statement: Intercept Detection</p>
            <p className="display op-line">
              Speak while <em>the reply is playing.</em>
            </p>
            <p className="op-sub">Speech activity can lower playback volume; a transcript rule decides whether to continue or stop.</p>
          </Shot>
          <Shot a={0.75} b={2} f={0.05} className="op-panel op-panel--end">
            <p className="display op-line op-line--sm">
              Keep the mic open. <em>Make room to respond.</em>
            </p>
            <OpeningActions />
          </Shot>
        </div>
      </div>
    </Scene>
  )
}

function Manifesto() {
  return (
    <Scene length={240} tone="paper" className="manifesto" label="The Problem" chapter="The Core Challenge">
      <div className="wrap manifesto-inner">
        <Slate index="The Challenge">Problem Statement</Slate>
        <ScrubText
          as="h2"
          mode="pin"
          className="display manifesto-text"
          accent={['half-duplex', 'interrupt', 'instant']}
      text="A voice assistant should leave room for a correction. EchoFlow keeps listening while it replies, then uses a browser transcript to decide whether to stop and answer again."
        />
      </div>
      <div className="iris" aria-hidden="true" />
    </Scene>
  )
}

function FourPillars() {
  const pillars = [
    {
      icon: Shield,
      tag: 'Stage 1',
      title: 'Browser-managed echo control',
      desc: 'The microphone requests the browser’s echo cancellation and noise suppression. Their effect depends on the browser, microphone, and room.',
    },
    {
      icon: Zap,
      tag: 'Stage 2',
      title: 'Speech activity ducking',
      desc: 'A lightweight server-side activity detector can lower assistant volume while the microphone hears speech, then restore it after silence.',
    },
    {
      icon: Cpu,
      tag: 'Stage 3',
      title: 'Transcript-based intent rules',
      desc: 'Final browser transcripts are checked against a small phrase list. Recognized acknowledgements can be ignored; other speech can interrupt.',
    },
    {
      icon: Activity,
      tag: 'Stage 4',
      title: 'Estimated context recovery',
      desc: 'On interruption, the server estimates how many words played from elapsed time and an assumed speaking rate. It is not word-level alignment.',
    },
  ]

  return (
    <section className="section beats-section" data-tone="ink" data-chapter="Four Pillars" aria-label="Key Pillars">
      <div className="wrap">
        <div className="section-head">
          <Slate index="Architecture">The 4-Stage Engine</Slate>
          <h2 className="display beats-h2">
            Built to explore <em>more natural</em> conversational turn-taking.
          </h2>
        </div>
        <div className="grid-2x2">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08} className="card beat-card">
              <span className="card-kicker">{p.tag}</span>
              <p.icon size={28} className="beat-icon" aria-hidden="true" style={{ marginBottom: '12px', color: '#fff' }} />
              <h3 className="card-title">{p.title}</h3>
              <p className="card-body">{p.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Programme() {
  return (
    <section className="section prog-section" data-tone="paper" data-chapter="Sections" aria-label="Sections">
      <div className="wrap">
        <div className="section-head">
          <Slate index="Navigation">Documentation</Slate>
          <h2 className="display prog-h2">
            Explore the <em>EchoFlow Project</em>
          </h2>
        </div>
        <div className="prog-grid">
          {PAGES.map((p, i) => (
            <Reveal key={p.to} delay={i * 0.05} className="card prog-card">
              <div className="prog-card-top">
                <span className="prog-roman">{p.roman}</span>
                <span className="prog-run">{p.run}</span>
              </div>
              <h3 className="prog-title">{p.label}</h3>
              <p className="prog-blurb">{p.blurb}</p>
              <TLink to={p.to} className="btn prog-link">
                Read section <ArrowUpRight size={14} aria-hidden="true" />
              </TLink>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function AssistantTeaser() {
  return (
    <section className="section teaser-section" data-tone="ink" data-chapter="Live Assistant" aria-label="Assistant Teaser">
      <div className="wrap teaser-inner">
        <Slate index="Demo">Voice Prototype</Slate>
        <h2 className="display teaser-h2">
          Try a conversation <em>with room to interrupt.</em>
        </h2>
        <p className="lead teaser-lead">
          Start the microphone or type a message. EchoFlow sends audio frames to its VAD and uses finalized browser speech transcripts for voice turns. Speech playback is synthesized as a complete reply, and interruption history is approximate.
        </p>
        <div className="teaser-actions">
          <TLink to="/assistant" className="btn btn--solid btn--lg">
            <Mic size={18} aria-hidden="true" /> Launch Voice Assistant
          </TLink>
          <TLink to="/hud" className="btn btn--lg">
            <Activity size={18} aria-hidden="true" /> Open Telemetry HUD
          </TLink>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <>
      <Opening />
      <Manifesto />
      <FourPillars />
      <Programme />
      <AssistantTeaser />
      <Marquee items={['THEME 8: CONVERSATIONAL VOICE ASSISTANT', 'INTERCEPT DETECTION', 'CURIOUSPARC 2026', 'STATE INNOVATION CHALLENGE']} />
    </>
  )
}
