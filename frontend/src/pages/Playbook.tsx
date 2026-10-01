import { CtaBand, PageHero, SectionHead } from '../components/bits'
import { Reveal } from '../components/motion'
import { Activity, AudioLines, Gauge, Scissors } from 'lucide-react'

export default function Playbook() {
  const behavior = [
    { icon: AudioLines, label: 'Microphone frames', value: '30 ms · 480 samples', desc: 'Mono PCM is resampled to 16 kHz in the browser and sent to the FastAPI WebSocket.' },
    { icon: Activity, label: 'Speech activity', value: 'Heuristic · threshold 0.65', desc: 'A lightweight energy and spectrum check estimates activity. It is not a trained VAD model.' },
    { icon: Gauge, label: 'Playback duck', value: '15% default level', desc: 'The server setting can lower playback during detected speech. The fade and output level depend on browser timing.' },
    { icon: Scissors, label: 'Interruption history', value: 'Estimated · 165 words/min', desc: 'Rollback uses elapsed playback time and an assumed rate; it is not word-aligned transcription.' },
  ]

  return (
    <>
      <PageHero
        reel="Reel III"
        name="Diagnostics & limits"
        num="03"
        title={<>What the <em>prototype measures.</em></>}
        lead="Current implementation details are shown here instead of unverified performance benchmarks."
      />

      <section className="section" data-tone="ink" data-chapter="Implementation">
        <div className="wrap">
          <SectionHead label="Current behavior" title="Configured values, not performance claims" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '32px' }}>
            {behavior.map((item, index) => (
              <Reveal key={item.label} delay={index * 0.06}>
                <div className="card" style={{ padding: '24px' }}>
                  <item.icon size={24} aria-hidden="true" style={{ marginBottom: '16px', color: '#fff' }} />
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', textTransform: 'uppercase', opacity: 0.65 }}>{item.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 12px' }}>{item.value}</div>
                  <p style={{ fontSize: '13px', color: '#a0aec0', lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <p style={{ marginTop: '24px', color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>
            Real response time and recognition quality vary with the selected model, network, browser, microphone, and room. The demo does not claim a fixed interruption latency or accuracy rate.
          </p>
        </div>
      </section>

      <CtaBand
        title="Try the live assistant."
        body="Use the typed input for a quick check, or allow microphone access to exercise browser recognition and speech activity detection."
        to="/assistant"
        label="Open Voice Assistant"
        next="Next reel"
      />
    </>
  )
}
