import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Gallery() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [albums, setAlbums] = useState([])
  const [selectedAlbum, setSelectedAlbum] = useState(null)
  const [photos, setPhotos] = useState([])
  const [photoUrls, setPhotoUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [bgIndex, setBgIndex] = useState(0)
  const [allPhotoUrls, setAllPhotoUrls] = useState([])

  useEffect(() => {
    fetchProfile()
    fetchAlbums()
  }, [])

  useEffect(() => {
    const fetchAllPhotosForBg = async () => {
      const { data } = await supabase
        .from('photos')
        .select('file_path')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (data && data.length > 0) {
        const urls = []
        for (const photo of data) {
          const { data: urlData } = await supabase.storage
            .from('photos')
            .createSignedUrl(photo.file_path, 7200)
          if (urlData) urls.push(urlData.signedUrl)
        }
        setAllPhotoUrls(urls)
      }
    }
    fetchAllPhotosForBg()
  }, [user])

  useEffect(() => {
    if (allPhotoUrls.length <= 1) return
    const timer = setInterval(() => {
      setBgIndex(prev => (prev + 1) % allPhotoUrls.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [allPhotoUrls])

  useEffect(() => {
    const checkAccess = async () => {
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('is_active, expires_at')
        .eq('id', user.id)
        .single()
      if (!data) return
      const expired = data.expires_at && new Date(data.expires_at) < new Date()
      if (!data.is_active || expired) {
        await supabase.auth.signOut()
        navigate('/?erro=acesso_suspenso')
      }
    }
    checkAccess()
  }, [user])

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(data)
  }

  const fetchAlbums = async () => {
    const { data } = await supabase
      .from('albums')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
    setAlbums(data || [])
    setLoading(false)
  }

  const fetchPhotos = async (album) => {
    setSelectedAlbum(album)
    setLoadingPhotos(true)
    setPhotos([])
    setPhotoUrls({})
    const { data } = await supabase
      .from('photos')
      .select('*')
      .eq('album_id', album.id)
      .order('created_at', { ascending: true })
    if (data) {
      setPhotos(data)
      const urls = {}
      for (const photo of data) {
        const { data: urlData } = await supabase.storage
          .from('photos')
          .createSignedUrl(photo.file_path, 3600)
        if (urlData) urls[photo.id] = urlData.signedUrl
      }
      setPhotoUrls(urls)
    }
    setLoadingPhotos(false)
  }

  const handleDownload = async (photo) => {
    const url = photoUrls[photo.id]
    if (!url) return
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = photo.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Erro ao baixar foto:', error)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const goBack = () => {
    setSelectedAlbum(null)
    setPhotos([])
    setPhotoUrls({})
    setLightbox(null)
  }

  const openLightbox = (photo) => setLightbox(photo)
  const closeLightbox = () => setLightbox(null)

  const navigateLightbox = (direction) => {
    const index = photos.findIndex(p => p.id === lightbox.id)
    const newIndex = index + direction
    if (newIndex >= 0 && newIndex < photos.length) {
      setLightbox(photos[newIndex])
    }
  }

  return (
    <div className="min-h-screen bg-black text-white relative">

      {/* Slideshow de fundo com as fotos do cliente */}
      {allPhotoUrls.length > 0 && (
        <>
          {allPhotoUrls.map((url, index) => (
            <div
              key={index}
              className="fixed inset-0 transition-opacity duration-[2000ms] pointer-events-none"
              style={{ opacity: bgIndex === index ? 1 : 0 }}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md pointer-events-none" />
        </>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedAlbum && (
              <button onClick={goBack}
                className="text-zinc-400 hover:text-white transition mr-1 p-1 rounded-lg hover:bg-zinc-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </div>
            <div>
              <span className="font-semibold tracking-tight text-sm">Atlanta Estúdio</span>
              {selectedAlbum && (
                <span className="text-zinc-500 text-sm"> / {selectedAlbum.title}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Botão Contactar M.A CODE */}
            <a
              href="https://wa.me/244921258719"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 bg-green-600/10 hover:bg-green-600/20 border border-green-600/20 text-green-400 text-xs font-medium px-3 py-2 rounded-xl transition"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.528 5.847L.057 23.428a.75.75 0 00.921.921l5.579-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.718 9.718 0 01-4.953-1.354l-.355-.211-3.676.969.983-3.593-.232-.371A9.718 9.718 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
              </svg>
              Contactar Atlanta Estúdio
            </a>

            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 text-xs font-semibold">
                {profile?.full_name?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-zinc-400">{profile?.full_name}</span>
            </div>
            <button onClick={handleLogout}
              className="text-sm text-zinc-400 hover:text-white transition flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">

        {/* Vista de Álbuns */}
        {!selectedAlbum && (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-white">
                Olá, {profile?.full_name?.split(' ')[0]} 👋
              </h1>
              <p className="text-zinc-400 mt-1 text-sm">Aqui estão os teus álbuns de fotografias</p>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : albums.length === 0 ? (
              <div className="text-center py-24">
                <div className="w-20 h-20 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
                <p className="text-zinc-500 text-sm">Ainda não tens álbuns disponíveis.</p>
                <p className="text-zinc-700 text-xs mt-1">O estudio irá adicionar as tuas fotos em breve.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {albums.map(album => (
                  <button
                    key={album.id}
                    onClick={() => fetchPhotos(album)}
                    className="group bg-zinc-900/70 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6 text-left hover:border-blue-500/50 hover:bg-zinc-900/90 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/5"
                  >
                    <div className="w-12 h-12 rounded-xl bg-zinc-800 group-hover:bg-blue-600/20 border border-zinc-700 group-hover:border-blue-600/30 flex items-center justify-center mb-4 transition-all duration-200">
                      <svg className="w-6 h-6 text-zinc-500 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    </div>
                    <h3 className="text-white font-medium text-sm group-hover:text-blue-400 transition-colors">{album.title}</h3>
                    {album.description && (
                      <p className="text-zinc-500 text-xs mt-1">{album.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-4 text-zinc-600 group-hover:text-zinc-400 transition-colors">
                      <span className="text-xs">Ver fotos</span>
                      <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Vista de Fotos */}
        {selectedAlbum && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-white">{selectedAlbum.title}</h1>
                {selectedAlbum.description && (
                  <p className="text-zinc-500 text-sm mt-1">{selectedAlbum.description}</p>
                )}
              </div>
              {photos.length > 0 && (
                <span className="text-xs text-zinc-500 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-full">
                  {photos.length} foto{photos.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {loadingPhotos ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-600 text-sm">A carregar as tuas fotos...</p>
              </div>
            ) : photos.length === 0 ? (
              <div className="text-center py-24 text-zinc-600">
                <p className="text-sm">Este álbum ainda não tem fotos.</p>
              </div>
            ) : (
              <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
                {photos.map(photo => (
                  <div
                    key={photo.id}
                    className="group relative break-inside-avoid rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-blue-500/40 transition-all duration-200"
                    onClick={() => openLightbox(photo)}
                  >
                    {photoUrls[photo.id] ? (
                      <img src={photoUrls[photo.id]} alt={photo.file_name}
                        className="w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
                      <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803zM10.5 7.5v6m3-3h-6" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={closeLightbox}>
          <button onClick={closeLightbox}
            className="absolute top-4 right-4 text-zinc-400 hover:text-white transition z-10 p-2 rounded-xl hover:bg-zinc-800">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDownload(lightbox) }}
            className="absolute top-4 left-4 text-zinc-400 hover:text-white transition z-10 p-2 rounded-xl hover:bg-zinc-800 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span className="text-sm hidden sm:block">Download</span>
          </button>
          {photos.findIndex(p => p.id === lightbox.id) > 0 && (
            <button onClick={(e) => { e.stopPropagation(); navigateLightbox(-1) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition z-10 p-2 rounded-xl hover:bg-zinc-800">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <img src={photoUrls[lightbox.id]} alt={lightbox.file_name}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()} />
          {photos.findIndex(p => p.id === lightbox.id) < photos.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); navigateLightbox(1) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition z-10 p-2 rounded-xl hover:bg-zinc-800">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-zinc-500 text-xs bg-zinc-900/80 px-3 py-1.5 rounded-full border border-zinc-800">
            {photos.findIndex(p => p.id === lightbox.id) + 1} / {photos.length}
          </div>
        </div>
      )}
    </div>
  )
}
