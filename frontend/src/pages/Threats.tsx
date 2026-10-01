import { CtaBand, PageHero, SectionHead } from '../components/bits'
import { Reveal } from '../components/motion'
import { AlertTriangle, VolumeX, RefreshCw, MessageSquareOff } from 'lucide-react'

export default function Threats() {
  const problems = [
    {
      icon: VolumeX,
      title: '1. Correcting a spoken reply',
      desc: 'A long response can be frustrating when the listener already knows what needs to change. EchoFlow keeps capture running during playback so the person can try to redirect the conversation.',
    },
    {
      icon: AlertTriangle,
      title: '2. Speaker sound in the microphone',
      desc: 'Playback can leak into a microphone. The demo requests echo cancellation from the browser, but does not provide its own echo-cancellation model or guarantee a particular suppression level.',
    },
    {
      icon: MessageSquareOff,
      title: '3. Speech recognition mistakes',
      desc: 'Browser recognition may miss words or return an incorrect transcript. A small rule list handles some acknowledgements; other recognized speech may be treated as a request to interrupt.',
    },
    {
      icon: RefreshCw,
      title: '4. Knowing what was heard',
      desc: 'The demo estimates the played portion from elapsed time and an assumed speaking rate. Speech speed varies, so the estimate may include words that were not heard or omit words that were.',
    },
  ]

  return (
    <>
      <PageHero
        reel="Reel II"
        name="Turn taking"
        num="02"
        title={<>The <em>turn-taking</em> problem.</>}
        lead="What can go wrong when a person speaks while an assistant response is playing, and where this prototype has limits."
      />

      <section className="section" data-tone="paper" data-chapter="Failures">
        <div className="wrap">
          <SectionHead label="Limitations" title="Four things to keep in mind" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginTop: '32px' }}>
            {problems.map((problem, index) => (
              <Reveal key={problem.title} delay={index * 0.08}>
                <div className="card" style={{ padding: '28px' }}>
                  <problem.icon size={28} style={{ color: '#ff3366', marginBottom: '16px' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>{problem.title}</h3>
                  <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#64748b' }}>{problem.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Try speaking over a reply."
        body="The demo can lower playback volume on detected speech and use a finalized transcript to decide whether to continue or respond. It may mishear or misclassify speech."
        to="/assistant"
        label="Try EchoFlow Voice"
        next="Next reel"
      />
    </>
  )
}
