import { CtaBand, PageHero, SectionHead } from '../components/bits'
import { Reveal } from '../components/motion'
import { Cloud, HardDrive, Mic, Server } from 'lucide-react'

export default function Privacy() {
  const paths = [
    {
      icon: Cloud,
      title: 'Cloud chat mode',
      desc: 'The FastAPI server sends conversation text to the configured Groq or Gemini provider. If neither key is set, it returns a clearly labeled canned response.',
      stack: ['Provider keys are read by the server from .env', 'Cloud replies are synthesized through Edge TTS', 'The server prefers Groq when both provider keys are set'],
    },
    {
      icon: HardDrive,
      title: 'Local chat mode',
      desc: 'The server can use an installed Ollama model and pyttsx3 for local chat and speech. If Ollama is unavailable, chat falls back to simple rule-based replies.',
      stack: ['Requires a running Ollama service and installed model', 'Local speech depends on pyttsx3 and a system voice', 'Browser speech recognition may still use a network service'],
    },
  ]

  const data = [
    { icon: Mic, title: 'Microphone audio', text: 'The browser sends 16 kHz mono audio frames to the server for speech-activity detection. Browser SpeechRecognition is separate; its provider and audio handling depend on the browser.' },
    { icon: Server, title: 'Conversation data', text: 'The server keeps conversation context in memory for the lifetime of the WebSocket session. Reconnecting starts a new session. This demo does not store a database transcript.' },
  ]

  return (
    <>
      <PageHero
        reel="Reel IV"
        name="Architecture & data"
        num="04"
        title={<>Where audio and text <em>go.</em></>}
        lead="The prototype has cloud and local chat paths, but browser speech recognition can have separate network behavior."
      />

      <section className="section" data-tone="paper" data-chapter="Pipelines">
        <div className="wrap">
          <SectionHead label="Chat and speech" title="Two server-side modes" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginTop: '32px' }}>
            {paths.map((path, index) => (
              <Reveal key={path.title} delay={index * 0.1}>
                <div className="card" style={{ padding: '32px' }}>
                  <path.icon size={30} aria-hidden="true" style={{ color: '#334155', marginBottom: '16px' }} />
                  <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{path.title}</h3>
                  <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#64748b', marginBottom: '20px' }}>{path.desc}</p>
                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {path.stack.map((item) => (
                      <li key={item} style={{ fontSize: '13px', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#334155', marginTop: '6px', flexShrink: 0 }} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" data-tone="ink" data-chapter="Data handling">
        <div className="wrap">
          <SectionHead label="Data handling" title="What the demo sends and retains" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '32px' }}>
            {data.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.08}>
                <div className="card" style={{ padding: '24px' }}>
                  <item.icon size={24} aria-hidden="true" style={{ marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '17px', marginBottom: '8px' }}>{item.title}</h3>
                  <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#a0aec0' }}>{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Check the configuration before a demo."
        body="Choose cloud or local mode in the server environment. Do not expose this unauthenticated prototype to an untrusted network."
        to="/help"
        label="Read setup help"
        next="Next reel"
      />
    </>
  )
}
