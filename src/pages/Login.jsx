import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [bgImages, setBgImages] = useState([])
  const [bgIndex, setBgIndex] = useState(0)
  const navigate = useNavigate()

  const erroAcesso = window.location.search.includes('erro=acesso_suspenso')

  useEffect(() => {
    const fetchBgs = async () => {
      const { data } = await supabase
        .from('login_backgrounds')
        .select('file_path')
        .order('created_at', { ascending: false })
      if (data && data.length > 0) {
        const urls = data.map(bg => {
          const { data: urlData } = supabase.storage
            .from('backgrounds')
            .getPublicUrl(bg.file_path)
          return urlData.publicUrl
        })
        setBgImages(urls)
      }
    }
    fetchBgs()
  }, [])

  useEffect(() => {
    if (bgImages.length <= 1) return
    const timer = setInterval(() => {
      setBgIndex(prev => (prev + 1) % bgImages.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [bgImages])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou senha incorrectos.')
      setLoading(false)
      return
    }
    if (data.user.email === import.meta.env.VITE_ADMIN_EMAIL) {
      navigate('/admin')
    } else {
      navigate('/gallery')
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 relative overflow-hidden">

      {/* Slideshow de fundo */}
      {bgImages.length > 0 ? (
        <>
          {bgImages.map((url, index) => (
            <div
              key={index}
              className="absolute inset-0 transition-opacity duration-[1500ms]"
              style={{ opacity: bgIndex === index ? 1 : 0 }}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        </>
      ) : (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl" />
        </div>
      )}

      {/* Botão Contactar Atlanta Estúdio — canto superior direito */}
      <div className="absolute top-4 right-4 z-20">
        <a
          href="https://wa.me/244921258719"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-blue-600/20 hover:bg-green-600/30 border border-green-600/30 text-green-400 text-xs font-medium px-4 py-2.5 rounded-xl transition backdrop-blur-sm shadow-lg"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.528 5.847L.057 23.428a.75.75 0 00.921.921l5.579-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.718 9.718 0 01-4.953-1.354l-.355-.211-3.676.969.983-3.593-.232-.371A9.718 9.718 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
          </svg>
          Contactar Atlanta Estúdio
        </a>
      </div>

      {/* Indicadores do slideshow */}
      {bgImages.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {bgImages.map((_, i) => (
            <button
              key={i}
              onClick={() => setBgIndex(i)}
              className={`rounded-full transition-all duration-300 ${
                bgIndex === i ? 'w-5 h-1.5 bg-blue-500' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}

      {/* Card de login */}
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-600/30">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Atlanta Estúdio</h1>
          <p className="text-zinc-400 text-sm mt-1">As tuas memórias, sempre disponíveis</p>
        </div>

        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-medium text-white mb-6">Entrar na tua conta</h2>

          {erroAcesso && (
            <div className="mb-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm text-center">
              O teu acesso foi suspenso ou expirou. Contacta o estudio.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="o_teu@email.com"
                required
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-blue-600/20 mt-2"
            >
              {loading ? 'A entrar...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          © 2025 Atalanta Estudio · Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
