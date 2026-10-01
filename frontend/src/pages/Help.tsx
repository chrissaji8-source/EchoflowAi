import { CtaBand, PageHero, SectionHead } from '../components/bits'
import { Reveal } from '../components/motion'
import { KeyRound, Mic, MonitorPlay, Server } from 'lucide-react'

export default function Help() {
  const setup = [
    { icon: Server, title: 'Start the server', text: 'From the project folder, activate the Python environment, install requirements, then run python server.py.' },
    { icon: MonitorPlay, title: 'Build the website', text: 'From frontend, run npm install and npm run build before starting the server. For development, run Vite and the FastAPI server in separate terminals.' },
    { icon: Mic, title: 'Allow microphone access', text: 'Use localhost or HTTPS, allow the browser prompt, and choose a browser with SpeechRecognition support. If it is unavailable, use the typed-message control.' },
    { icon: KeyRound, title: 'Configure a model', text: 'Set GROQ_API_KEY or GEMINI_API_KEY in the server-side .env file and restart. The key is not entered into this page.' },
  ]

  const faqs = [
    {
      q: 'Why does the connection show offline?',
      a: 'Confirm the FastAPI server is running on port 8000, then reload the page. The status means the WebSocket is disconnected; it does not mean the server switched to local mode.',
    },
    {
      q: 'Why can I type but not speak?',
      a: 'Microphone capture requires localhost or HTTPS and browser permission. Live transcription also depends on the browser SpeechRecognition API. Try a supported browser or use typed input.',
    },
    {
      q: 'Can the demo work without internet?',
      a: 'Local chat can use Ollama and local speech can use pyttsx3, but browser speech recognition may still use a network service. The microphone and local model must also be configured.',
    },
    {
      q: 'Is interruption rollback exact?',
      a: 'No. It estimates the amount of speech played using elapsed time and a nominal speaking rate. It is not word-level audio alignment.',
    },
  ]

  return (
    <>
      <PageHero
        reel="Reel V"
        name="Setup & help"
        num="05"
        title={<>Get EchoFlow <em>running.</em></>}
        lead="A short setup checklist and answers to common microphone, connection, and model questions."
      />

      <section className="section" data-tone="ink" data-chapter="Setup">
        <div className="wrap">
          <SectionHead label="Setup" title="Before opening the assistant" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '32px' }}>
            {setup.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.06}>
                <div className="card" style={{ padding: '24px' }}>
                  <item.icon size={24} aria-hidden="true" style={{ color: '#fff', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>{item.title}</h3>
                  <p style={{ fontSize: '13px', color: '#a0aec0', lineHeight: 1.55 }}>{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <div style={{ marginTop: '64px' }}>
            <SectionHead label="FAQ" title="Common questions" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
              {faqs.map((faq, index) => (
                <Reveal key={faq.q} delay={index * 0.04}>
                  <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', color: '#fff' }}>{faq.q}</h3>
                    <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#a0aec0' }}>{faq.a}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Ready to try a conversation?"
        body="Open the assistant after the backend and built frontend are running. You can start with typed messages before allowing microphone access."
        to="/assistant"
        label="Launch EchoFlow"
        next="Live demo"
      />
    </>
  )
}
