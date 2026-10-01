import { CtaBand, PageHero, SectionHead } from '../components/bits'
import { Reveal } from '../components/motion'
import { Shield, Zap, Cpu, Activity, CheckCircle2 } from 'lucide-react'

export default function HowItWorks() {
  const stages = [
    {
      num: '01',
      icon: Shield,
      title: 'Microphone capture',
      tagline: 'Browser-managed audio processing',
      desc: 'The browser requests echo cancellation and noise suppression, then an AudioWorklet converts microphone audio into 16 kHz mono PCM frames for the server. Browser speech recognition separately supplies finalized transcripts when supported.',
      bullets: [
        '16 kHz mono PCM, sent in 30 ms frames',
        'Echo cancellation is requested from the browser',
        'Speech recognition support and processing vary by browser',
      ],
    },
    {
      num: '02',
      icon: Zap,
      title: 'Speech activity ducking',
      tagline: 'Lightweight server-side heuristic',
      desc: 'The server scores each audio frame with an energy and spectral heuristic. When speech activity begins during assistant playback, the browser lowers output volume; it restores the level after the detector sees silence.',
      bullets: [
        '30 ms frames with a configurable score threshold',
        'Default duck level is 15% of the selected volume',
        'This detector may miss quiet speech or react to noise',
      ],
    },
    {
      num: '03',
      icon: Cpu,
      title: 'Transcript-based interruption rules',
      tagline: 'Barge-In vs. Backchannel Classification',
      desc: 'When the browser supplies a final transcript, the server compares it with a small list of acknowledgements. A recognized acknowledgement leaves playback running; other finalized speech can stop the current reply and start another turn.',
      bullets: [
        'Final transcripts only; interim words do not start turns',
        'A phrase list recognizes a limited set of acknowledgements',
        'Unrecognized speech can be treated as an interruption',
      ],
    },
    {
      num: '04',
      icon: Activity,
      title: 'Approximate context recovery',
      tagline: 'Estimated from playback time',
      desc: 'The server estimates how many words may have played using elapsed playback time and an assumed speaking rate. The estimate is included in the next prompt; it does not identify the exact word heard at the interruption.',
      bullets: [
        'Assistant text is synthesized as a complete audio file',
        'Playback timing is approximate, not word alignment',
        'An interrupted response is cancelled before the next turn',
      ],
    },
  ]

  return (
    <>
      <PageHero
        reel="Reel I"
        name="How it works"
        num="01"
        title={
          <>
            How the <em>voice demo</em> works.
          </>
        }
        lead="From browser microphone capture to transcript-based turn-taking and approximate playback recovery."
      />

      <section className="section" data-tone="ink" data-chapter="Pipeline">
        <div className="wrap">
          <SectionHead label="Architecture" title="The four-step request flow" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginTop: '32px' }}>
            {stages.map((st, i) => (
              <Reveal key={st.num} delay={i * 0.1}>
                <div className="card" style={{ padding: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace', opacity: 0.5 }}>{st.num}</span>
                      <st.icon size={28} style={{ color: '#fff' }} />
                      <h3 style={{ fontSize: '20px', fontWeight: 700 }}>{st.title}</h3>
                    </div>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '4px' }}>
                      {st.tagline}
                    </span>
                  </div>

                  <p style={{ marginTop: '16px', fontSize: '14px', lineHeight: 1.6, color: '#a0aec0' }}>
                    {st.desc}
                  </p>

                  <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                    {st.bullets.map((b) => (
                      <div key={b} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e2e8f0' }}>
                        <CheckCircle2 size={16} style={{ color: '#00f0ff', flexShrink: 0 }} />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Try the assistant in your browser."
        body="Use a supported browser for microphone transcription, or type a message in the assistant. Results depend on your browser, selected model, network, and audio devices."
        to="/assistant"
        label="Launch Voice Assistant"
        next="Next reel"
      />
    </>
  )
}
