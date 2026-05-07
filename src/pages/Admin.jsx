import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'

export default function Admin() {
  const [clients, setClients] = useState([])
  const [albums, setAlbums] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('clients')
  const navigate = useNavigate()

  const [loginBgs, setLoginBgs] = useState([])
  const [uploadingBg, setUploadingBg] = useState(false)
  const [bgFiles, setBgFiles] = useState([])

  const [showClientModal, setShowClientModal] = useState(false)
  const [showAlbumModal, setShowAlbumModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showMaCodeModal, setShowMaCodeModal] = useState(false)

  const [bannerIndex, setBannerIndex] = useState(0)
  const [selectedClient, setSelectedClient] = useState(null)
  const [clientPhotos, setClientPhotos] = useState([])
  const [clientPhotoUrls, setClientPhotoUrls] = useState({})
  const [loadingClientDetail, setLoadingClientDetail] = useState(false)
  const [showPasswordMap, setShowPasswordMap] = useState({})

  const [newClient, setNewClient] = useState({ full_name: '', email: '', password: '' })
  const [newAlbum, setNewAlbum] = useState({ title: '', description: '', client_id: '' })
  const [uploadData, setUploadData] = useState({ album_id: '', client_id: '', files: [] })
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })

  useEffect(() => {
    const timer = setInterval(() => {
      setBannerIndex(prev => (prev + 1) % 7)
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage({ type: '', text: '' }), 4000)
  }

  const fetchLoginBgs = async () => {
    const { data } = await supabase
      .from('login_backgrounds')
      .select('*')
      .order('created_at', { ascending: false })
    setLoginBgs(data || [])
  }

  const handleUploadBg = async (e) => {
    e.preventDefault()
    setUploadingBg(true)
    for (const file of bgFiles) {
      // Comprimir imagem de fundo também
      const compressed = await imageCompression(file, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true
      })
      const filePath = `login/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { error } = await supabase.storage
        .from('backgrounds')
        .upload(filePath, compressed, { upsert: true })
      if (!error) {
        await supabase.from('login_backgrounds').insert({
          file_path: filePath,
          file_name: file.name
        })
      }
    }
    showMsg('success', `${bgFiles.length} imagem(ns) de fundo adicionada(s)!`)
    setBgFiles([])
    fetchLoginBgs()
    setUploadingBg(false)
  }

  const handleDeleteBg = async (bg) => {
    if (!confirm('Remover esta imagem de fundo?')) return
    await supabase.storage.from('backgrounds').remove([bg.file_path])
    await supabase.from('login_backgrounds').delete().eq('id', bg.id)
    showMsg('success', 'Imagem removida.')
    fetchLoginBgs()
  }

  const getBgPublicUrl = (filePath) => {
    const { data } = supabase.storage.from('backgrounds').getPublicUrl(filePath)
    return data.publicUrl
  }

  const fetchClients = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }, [])

  const fetchAlbums = useCallback(async () => {
    const { data } = await supabase
      .from('albums')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
    setAlbums(data || [])
  }, [])

  const checkExpiringClients = useCallback(async (clientList) => {
    const now = new Date()
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    for (const client of clientList) {
      if (!client.is_active || !client.expires_at) continue
      const expiresAt = new Date(client.expires_at)
      if (expiresAt <= in3Days && expiresAt > now) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('client_id', client.id)
          .eq('type', 'expiring_soon')
          .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
        if (!existing || existing.length === 0) {
          const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
          await supabase.from('notifications').insert({
            client_id: client.id,
            type: 'expiring_soon',
            message: `O acesso de ${client.full_name} expira em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}. Renove o pagamento.`,
            is_read: false
          })
        }
      }
    }
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*, profiles(full_name, email)')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
    setNotifications(data || [])
  }

  useEffect(() => {
    const init = async () => {
      await fetchClients()
      await fetchAlbums()
      await fetchNotifications()
      await fetchLoginBgs()
    }
    init()
  }, [])

  useEffect(() => {
    if (clients.length > 0) {
      checkExpiringClients(clients)
    }
  }, [clients])

  const handleCreateClient = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: newClient.email,
      password: newClient.password,
      email_confirm: true
    })
    if (authError) {
      showMsg('error', 'Erro ao criar cliente: ' + authError.message)
      setActionLoading(false)
      return
    }
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      full_name: newClient.full_name,
      email: newClient.email,
      is_active: true,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      password_plain: newClient.password
    })
    if (profileError) {
      showMsg('error', 'Erro ao guardar perfil: ' + profileError.message)
      setActionLoading(false)
      return
    }
    showMsg('success', `Cliente ${newClient.full_name} criado com sucesso!`)
    setNewClient({ full_name: '', email: '', password: '' })
    setShowClientModal(false)
    fetchClients()
    setActionLoading(false)
  }

  const fetchClientDetail = async (client) => {
    setSelectedClient(client)
    setActiveTab('detail')
    setLoadingClientDetail(true)
    setClientPhotos([])
    setClientPhotoUrls({})
    const { data: photos } = await supabase
      .from('photos')
      .select('*, albums(title)')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
    if (photos) {
      setClientPhotos(photos)
      const urls = {}
      for (const photo of photos) {
        const { data: urlData } = await supabase.storage
          .from('photos')
          .createSignedUrl(photo.file_path, 3600)
        if (urlData) urls[photo.id] = urlData.signedUrl
      }
      setClientPhotoUrls(urls)
    }
    setLoadingClientDetail(false)
  }

  const toggleShowPassword = (clientId) => {
    setShowPasswordMap(prev => ({ ...prev, [clientId]: !prev[clientId] }))
  }

  const handleToggleAccess = async (client) => {
    const action = client.is_active ? 'suspender' : 'reactivar'
    if (!confirm(`Tens a certeza que queres ${action} o acesso de ${client.full_name}?`)) return
    if (client.is_active) {
      await supabaseAdmin.auth.admin.updateUserById(client.id, { ban_duration: '876600h' })
    } else {
      await supabaseAdmin.auth.admin.updateUserById(client.id, { ban_duration: 'none' })
    }
    await supabase
      .from('profiles')
      .update({
        is_active: !client.is_active,
        ...((!client.is_active) && {
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
      })
      .eq('id', client.id)
    showMsg('success', `Acesso de ${client.full_name} ${client.is_active ? 'suspenso' : 'reactivado'} com sucesso!`)
    fetchClients()
  }

  const handleRenewAccess = async (client) => {
    if (!confirm(`Renovar mais 30 dias para ${client.full_name}?`)) return
    await supabase
      .from('profiles')
      .update({
        is_active: true,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', client.id)
    await supabase.from('notifications').delete().eq('client_id', client.id).eq('type', 'expiring_soon')
    await supabaseAdmin.auth.admin.updateUserById(client.id, { ban_duration: 'none' })
    showMsg('success', `Acesso de ${client.full_name} renovado por mais 30 dias!`)
    fetchClients()
    fetchNotifications()
  }

  const handleMarkAsRead = async (notifId) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId)
    fetchNotifications()
  }

  const handleMarkAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    fetchNotifications()
  }

  const handleCreateAlbum = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    const { error } = await supabase.from('albums').insert({
      title: newAlbum.title,
      description: newAlbum.description,
      client_id: newAlbum.client_id
    })
    if (error) {
      showMsg('error', 'Erro ao criar álbum: ' + error.message)
    } else {
      showMsg('success', 'Álbum criado com sucesso!')
      setNewAlbum({ title: '', description: '', client_id: '' })
      setShowAlbumModal(false)
      fetchAlbums()
    }
    setActionLoading(false)
  }

  // ✅ handleUpload corrigido com compressão real
  const handleUpload = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    const files = uploadData.files
    let uploaded = 0
    setUploadProgress({ current: 0, total: files.length })

    for (const file of files) {
      try {
        // Comprimir imagem antes de enviar
        const compressedFile = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: file.type
        })

        const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_')
        const filePath = `${uploadData.client_id}/${uploadData.album_id}/${Date.now()}_${cleanName}`

        const { error: storageError } = await supabase.storage
          .from('photos')
          .upload(filePath, compressedFile)

        if (storageError) {
          console.error('Erro storage:', storageError)
          continue
        }

        await supabase.from('photos').insert({
          album_id: uploadData.album_id,
          client_id: uploadData.client_id,
          file_path: filePath,
          file_name: file.name
        })

        uploaded++
        setUploadProgress(prev => ({ ...prev, current: uploaded }))
      } catch (err) {
        console.error('Erro ao comprimir/enviar:', err)
      }
    }

    showMsg('success', `${uploaded} foto(s) comprimida(s) e enviada(s) com sucesso!`)
    setUploadData({ album_id: '', client_id: '', files: [] })
    setUploadProgress({ current: 0, total: 0 })
    setShowUploadModal(false)
    setActionLoading(false)
  }

  const handleDeleteClient = async (id, name) => {
    if (!confirm(`Tens a certeza que queres apagar o cliente ${name}? Esta acção é irreversível.`)) return
    await supabaseAdmin.auth.admin.deleteUser(id)
    await supabase.from('profiles').delete().eq('id', id)
    showMsg('success', 'Cliente apagado.')
    fetchClients()
  }

  const handleDeleteAlbum = async (id, title) => {
    if (!confirm(`Tens a certeza que queres apagar o álbum "${title}"?`)) return
    await supabase.from('albums').delete().eq('id', id)
    showMsg('success', 'Álbum apagado.')
    fetchAlbums()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const getDaysLeft = (expiresAt) => {
    if (!expiresAt) return null
    const diff = new Date(expiresAt) - new Date()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  const getExpiryBadge = (client) => {
    if (!client.is_active) return { label: 'Suspenso', color: 'text-red-400 bg-red-400/10 border-red-400/20' }
    const days = getDaysLeft(client.expires_at)
    if (days === null) return null
    if (days < 0) return { label: 'Expirado', color: 'text-red-400 bg-red-400/10 border-red-400/20' }
    if (days <= 3) return { label: `${days}d restantes`, color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' }
    if (days <= 7) return { label: `${days}d restantes`, color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' }
    return { label: `${days}d restantes`, color: 'text-green-400 bg-green-400/10 border-green-400/20' }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </div>
            <span className="font-semibold tracking-tight">Atalanta Estudio</span>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('notifications')}
              className="relative p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-zinc-400 hover:text-white transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full">

        {/* Mensagem feedback */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-xl border text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Banner Slideshow */}
        <div className="relative w-full h-64 rounded-2xl overflow-hidden mb-8 border border-zinc-800 shadow-2xl">
          {[
            "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=1400&q=80",
            "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=1400&q=80",
            "https://images.unsplash.com/photo-1554048612-b6a482bc67e5?w=1400&q=80",
            "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=1400&q=80",
            "https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=1400&q=80",
            "https://images.unsplash.com/photo-1500051638674-ff996a0ec29e?w=1400&q=80",
            "https://images.unsplash.com/photo-1519741497674-611481863552?w=1400&q=80",
          ].map((img, index) => (
            <div
              key={index}
              className="absolute inset-0 transition-opacity duration-1000"
              style={{ opacity: bannerIndex === index ? 1 : 0 }}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            </div>
          ))}
          <div className="absolute bottom-5 left-6 z-10">
            <p className="text-white font-semibold text-lg tracking-tight">Atalanta Estudio</p>
            <p className="text-zinc-400 text-sm mt-0.5">Capturando momentos, guardando memórias.</p>
          </div>
          <div className="absolute bottom-5 right-6 z-10 flex gap-1.5">
            {[0,1,2,3,4,5,6].map(i => (
              <button
                key={i}
                onClick={() => setBannerIndex(i)}
                className={`rounded-full transition-all duration-300 ${
                  bannerIndex === i ? 'w-5 h-1.5 bg-blue-500' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-zinc-500 text-xs mb-1">Total Clientes</p>
            <p className="text-2xl font-semibold">{clients.length}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-zinc-500 text-xs mb-1">Activos</p>
            <p className="text-2xl font-semibold text-green-400">{clients.filter(c => c.is_active).length}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-zinc-500 text-xs mb-1">A expirar (3 dias)</p>
            <p className="text-2xl font-semibold text-orange-400">
              {clients.filter(c => { const d = getDaysLeft(c.expires_at); return c.is_active && d !== null && d <= 3 && d >= 0 }).length}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-zinc-500 text-xs mb-1">Total Álbuns</p>
            <p className="text-2xl font-semibold">{albums.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit mb-6 overflow-x-auto">
          {[
            { id: 'clients', label: 'Clientes' },
            { id: 'albums', label: 'Álbuns' },
            { id: 'backgrounds', label: 'Fundos Login' },
            { id: 'notifications', label: `Alertas${notifications.length > 0 ? ` (${notifications.length})` : ''}` },
            ...(selectedClient ? [{ id: 'detail', label: `📋 ${selectedClient.full_name.split(' ')[0]}` }] : []),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* --- TAB: CLIENTES --- */}
        {activeTab === 'clients' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Clientes</h2>
              <button
                onClick={() => setShowClientModal(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Novo Cliente
              </button>
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <p className="text-sm">Nenhum cliente ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clients.map(client => {
                  const badge = getExpiryBadge(client)
                  return (
                    <div key={client.id} className={`bg-zinc-900 border rounded-2xl p-5 hover:border-zinc-700 transition ${!client.is_active ? 'border-zinc-800/50 opacity-60' : 'border-zinc-800'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${client.is_active ? 'bg-blue-600/20 border border-blue-600/30 text-blue-400' : 'bg-zinc-800 border border-zinc-700 text-zinc-500'}`}>
                            {client.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white font-medium text-sm">{client.full_name}</p>
                              {badge && (
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.color}`}>
                                  {badge.label}
                                </span>
                              )}
                            </div>
                            <p className="text-zinc-500 text-xs mt-0.5">{client.email}</p>
                            {client.expires_at && (
                              <p className="text-zinc-600 text-xs mt-0.5">
                                Expira: {new Date(client.expires_at).toLocaleDateString('pt-PT')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => fetchClientDetail(client)} title="Ver detalhes"
                            className="text-zinc-500 hover:text-blue-400 transition p-2 rounded-lg hover:bg-blue-400/10">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                          <button onClick={() => handleRenewAccess(client)} title="Renovar 30 dias"
                            className="text-zinc-500 hover:text-blue-400 transition p-2 rounded-lg hover:bg-blue-400/10">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                          </button>
                          <button onClick={() => handleToggleAccess(client)}
                            title={client.is_active ? 'Suspender' : 'Reactivar'}
                            className={`transition p-2 rounded-lg ${client.is_active ? 'text-zinc-500 hover:text-orange-400 hover:bg-orange-400/10' : 'text-zinc-500 hover:text-green-400 hover:bg-green-400/10'}`}>
                            {client.is_active ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                          <button onClick={() => handleDeleteClient(client.id, client.full_name)} title="Apagar"
                            className="text-zinc-600 hover:text-red-400 transition p-2 rounded-lg hover:bg-red-400/10">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* --- TAB: ÁLBUNS --- */}
        {activeTab === 'albums' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Álbuns</h2>
              <div className="flex gap-2">
                <button onClick={() => setShowUploadModal(true)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Enviar Fotos
                </button>
                <button onClick={() => setShowAlbumModal(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Novo Álbum
                </button>
              </div>
            </div>
            {albums.length === 0 ? (
              <div className="text-center py-16 text-zinc-600"><p className="text-sm">Nenhum álbum ainda.</p></div>
            ) : (
              <div className="space-y-3">
                {albums.map(album => (
                  <div key={album.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center justify-between hover:border-zinc-700 transition">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                        <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{album.title}</p>
                        <p className="text-zinc-500 text-xs mt-0.5">{album.profiles?.full_name} · {album.description || 'Sem descrição'}</p>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteAlbum(album.id, album.title)}
                      className="text-zinc-600 hover:text-red-400 transition p-2 rounded-lg hover:bg-red-400/10">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- TAB: FUNDOS LOGIN --- */}
        {activeTab === 'backgrounds' && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-medium">Fundos da Página de Login</h2>
              <p className="text-zinc-500 text-sm mt-1">Estas imagens passam como slideshow no fundo do login.</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
              <p className="text-white font-medium text-sm mb-4">Adicionar novas imagens de fundo</p>
              <form onSubmit={handleUploadBg} className="flex items-end gap-3">
                <div className="flex-1">
                  <input type="file" multiple accept="image/*"
                    onChange={e => setBgFiles(Array.from(e.target.files))} required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-xs" />
                  {bgFiles.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-1.5">{bgFiles.length} ficheiro(s) · Serão comprimidas automaticamente</p>
                  )}
                </div>
                <button type="submit" disabled={uploadingBg}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-3 rounded-xl transition shadow-lg shadow-blue-600/20 whitespace-nowrap">
                  {uploadingBg ? 'A comprimir...' : 'Enviar'}
                </button>
              </form>
            </div>
            {loginBgs.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <p className="text-sm">Nenhuma imagem de fundo ainda.</p>
              </div>
            ) : (
              <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
                {loginBgs.map(bg => (
                  <div key={bg.id} className="break-inside-avoid relative group rounded-xl overflow-hidden border border-zinc-800">
                    <img src={getBgPublicUrl(bg.file_path)} alt={bg.file_name}
                      className="w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex items-center justify-center">
                      <button onClick={() => handleDeleteBg(bg)}
                        className="opacity-0 group-hover:opacity-100 transition bg-red-500/90 hover:bg-red-500 text-white p-2 rounded-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- TAB: ALERTAS --- */}
        {activeTab === 'notifications' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Alertas de Expiração</h2>
              {notifications.length > 0 && (
                <button onClick={handleMarkAllRead} className="text-sm text-zinc-400 hover:text-white transition">
                  Marcar todos como lidos
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                </div>
                <p className="text-zinc-500 text-sm">Sem alertas de momento.</p>
                <p className="text-zinc-700 text-xs mt-1">Os alertas aparecem quando um cliente está a 3 dias de expirar.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map(notif => (
                  <div key={notif.id} className="bg-zinc-900 border border-orange-500/20 rounded-2xl p-5 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{notif.profiles?.full_name}</p>
                        <p className="text-zinc-400 text-sm mt-0.5">{notif.message}</p>
                        <p className="text-zinc-600 text-xs mt-1">
                          {new Date(notif.created_at).toLocaleDateString('pt-PT', {
                            day: '2-digit', month: 'long', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handleMarkAsRead(notif.id)} title="Marcar como lido"
                      className="text-zinc-600 hover:text-green-400 transition p-2 rounded-lg hover:bg-green-400/10 shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- TAB: DETALHE DO CLIENTE --- */}
        {activeTab === 'detail' && selectedClient && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setActiveTab('clients')}
                className="text-zinc-400 hover:text-white transition p-1.5 rounded-lg hover:bg-zinc-800">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-lg font-medium">Detalhes do Cliente</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 font-bold text-xl">
                      {selectedClient.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-semibold">{selectedClient.full_name}</p>
                      <p className="text-zinc-500 text-sm">{selectedClient.email}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Nome completo</p>
                      <p className="text-white text-sm">{selectedClient.full_name}</p>
                    </div>
                    <div>
                      <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Email</p>
                      <p className="text-white text-sm">{selectedClient.email}</p>
                    </div>
                    <div>
                      <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Senha</p>
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-mono">
                          {showPasswordMap[selectedClient.id] ? (selectedClient.password_plain || '—') : '••••••••'}
                        </p>
                        <button onClick={() => toggleShowPassword(selectedClient.id)} className="text-zinc-600 hover:text-zinc-300 transition">
                          {showPasswordMap[selectedClient.id] ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Data de criação</p>
                      <p className="text-white text-sm">
                        {new Date(selectedClient.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Expira em</p>
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm">
                          {selectedClient.expires_at
                            ? new Date(selectedClient.expires_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
                            : '—'}
                        </p>
                        {(() => { const b = getExpiryBadge(selectedClient); return b ? <span className={`text-xs px-2 py-0.5 rounded-full border ${b.color}`}>{b.label}</span> : null })()}
                      </div>
                    </div>
                    <div>
                      <p className="text-zinc-600 text-xs uppercase tracking-wider mb-1">Estado</p>
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${selectedClient.is_active ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>
                        {selectedClient.is_active ? 'Activo' : 'Suspenso'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-6 pt-5 border-t border-zinc-800 flex gap-2">
                    <button onClick={() => handleRenewAccess(selectedClient)}
                      className="flex-1 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/20 text-blue-400 text-xs font-medium py-2 rounded-xl transition flex items-center justify-center gap-1.5">
                      Renovar
                    </button>
                    <button onClick={() => handleToggleAccess(selectedClient)}
                      className={`flex-1 text-xs font-medium py-2 rounded-xl transition flex items-center justify-center gap-1.5 border ${selectedClient.is_active ? 'bg-orange-400/10 hover:bg-orange-400/20 border-orange-400/20 text-orange-400' : 'bg-green-400/10 hover:bg-green-400/20 border-green-400/20 text-green-400'}`}>
                      {selectedClient.is_active ? 'Suspender' : 'Reactivar'}
                    </button>
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Estatísticas</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400 text-sm">Total de fotos</span>
                      <span className="text-white font-semibold">{clientPhotos.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400 text-sm">Álbuns</span>
                      <span className="text-white font-semibold">{[...new Set(clientPhotos.map(p => p.album_id))].length}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-white font-medium">Fotos no perfil</p>
                    <span className="text-zinc-500 text-xs bg-zinc-800 px-3 py-1 rounded-full">
                      {clientPhotos.length} foto{clientPhotos.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {loadingClientDetail ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-zinc-600 text-sm">A carregar fotos...</p>
                    </div>
                  ) : clientPhotos.length === 0 ? (
                    <div className="text-center py-16">
                      <p className="text-zinc-600 text-sm">Nenhuma foto ainda.</p>
                    </div>
                  ) : (
                    <div className="columns-2 sm:columns-3 gap-3 space-y-3">
                      {clientPhotos.map(photo => (
                        <div key={photo.id} className="break-inside-avoid rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 group relative">
                          {clientPhotoUrls[photo.id] ? (
                            <img src={clientPhotoUrls[photo.id]} alt={photo.file_name} className="w-full object-cover" />
                          ) : (
                            <div className="w-full h-24 flex items-center justify-center">
                              <div className="w-4 h-4 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition">
                            <p className="text-white text-xs truncate">{photo.albums?.title}</p>
                            <p className="text-zinc-400 text-xs truncate">{photo.file_name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ✅ FOOTER */}
      <footer className="border-t border-zinc-800 bg-zinc-950 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-center gap-1 text-sm text-zinc-500">
          <span>Atalanta Estúdio · Criado pela</span>
          <button
            onClick={() => setShowMaCodeModal(true)}
            className="text-blue-400 hover:text-blue-300 font-semibold transition underline underline-offset-2"
          >
            M.A CODE
          </button>
        </div>
      </footer>

      {/* Modal — Novo Cliente */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-medium text-white mb-5">Novo Cliente</h3>
            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Nome completo</label>
                <input type="text" value={newClient.full_name}
                  onChange={e => setNewClient({...newClient, full_name: e.target.value})} required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Email</label>
                <input type="email" value={newClient.email}
                  onChange={e => setNewClient({...newClient, email: e.target.value})} required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Senha temporária</label>
                <input type="text" value={newClient.password}
                  onChange={e => setNewClient({...newClient, password: e.target.value})} required
                  placeholder="Envia esta senha ao cliente"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <p className="text-zinc-600 text-xs">O cliente terá acesso por 30 dias a partir de hoje.</p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowClientModal(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium py-3 rounded-xl transition">Cancelar</button>
                <button type="submit" disabled={actionLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-3 rounded-xl transition">
                  {actionLoading ? 'A criar...' : 'Criar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Novo Álbum */}
      {showAlbumModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-medium text-white mb-5">Novo Álbum</h3>
            <form onSubmit={handleCreateAlbum} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Cliente</label>
                <select value={newAlbum.client_id}
                  onChange={e => setNewAlbum({...newAlbum, client_id: e.target.value})} required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
                  <option value="">Selecciona um cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Título</label>
                <input type="text" value={newAlbum.title}
                  onChange={e => setNewAlbum({...newAlbum, title: e.target.value})} required
                  placeholder="Ex: Casamento · João & Maria"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Descrição (opcional)</label>
                <input type="text" value={newAlbum.description}
                  onChange={e => setNewAlbum({...newAlbum, description: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAlbumModal(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium py-3 rounded-xl transition">Cancelar</button>
                <button type="submit" disabled={actionLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-3 rounded-xl transition">
                  {actionLoading ? 'A criar...' : 'Criar Álbum'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Upload com compressão */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-medium text-white mb-2">Enviar Fotos</h3>
            <p className="text-zinc-500 text-xs mb-5">As imagens serão comprimidas automaticamente antes do envio.</p>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Cliente</label>
                <select value={uploadData.client_id}
                  onChange={e => setUploadData({...uploadData, client_id: e.target.value, album_id: ''})} required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
                  <option value="">Selecciona um cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Álbum</label>
                <select value={uploadData.album_id}
                  onChange={e => setUploadData({...uploadData, album_id: e.target.value})} required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
                  <option value="">Selecciona um álbum</option>
                  {albums.filter(a => a.client_id === uploadData.client_id).map(a => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Fotos</label>
                <input type="file" multiple accept="image/*"
                  onChange={e => setUploadData({...uploadData, files: Array.from(e.target.files)})} required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-xs" />
                {uploadData.files.length > 0 && (
                  <p className="text-xs text-zinc-500 mt-1.5">{uploadData.files.length} ficheiro(s) · Serão comprimidos para máx. 1MB cada</p>
                )}
              </div>

              {/* Barra de progresso durante upload */}
              {actionLoading && uploadProgress.total > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                    <span>A comprimir e enviar...</span>
                    <span>{uploadProgress.current}/{uploadProgress.total}</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowUploadModal(false)} disabled={actionLoading}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium py-3 rounded-xl transition">Cancelar</button>
                <button type="submit" disabled={actionLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-3 rounded-xl transition">
                  {actionLoading ? `A enviar ${uploadProgress.current}/${uploadProgress.total}...` : 'Enviar Fotos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✅ MODAL M.A CODE */}
      {showMaCodeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header do modal */}
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
                  <span className="text-white font-bold text-sm">M</span>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">M.A CODE</p>
                  <p className="text-zinc-500 text-xs">Soluções Tecnológicas Inteligentes</p>
                </div>
              </div>
              <button onClick={() => setShowMaCodeModal(false)}
                className="text-zinc-400 hover:text-white transition p-2 rounded-xl hover:bg-zinc-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">

              {/* Quem somos */}
              <div>
                <h3 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-600/20 flex items-center justify-center text-blue-400 text-xs">1</span>
                  Quem Somos?
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  A <span className="text-white font-medium">M.A CODE</span> é uma empresa de tecnologia de vanguarda dedicada a transformar a infraestrutura digital de organizações e a capacitar indivíduos para a nova economia tecnológica. Atuamos como um parceiro estratégico, unindo consultoria de alto nível, suporte técnico rigoroso e desenvolvimento de soluções personalizadas.
                </p>
                <p className="text-zinc-400 text-sm leading-relaxed mt-2">
                  O nosso DNA é focado na <span className="text-blue-400">inovação, agilidade e eficiência</span>, garantindo que a tecnologia seja o motor principal do crescimento dos nossos clientes.
                </p>
              </div>

              {/* Como funcionamos */}
              <div>
                <h3 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-600/20 flex items-center justify-center text-blue-400 text-xs">2</span>
                  Como Funcionamos
                </h3>
                <p className="text-zinc-400 text-sm mb-3">Operamos através de um modelo de <span className="text-white">Ciclo de Vida Tecnológico Completo</span>:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { n: '01', t: 'Diagnóstico', d: 'Entendemos a dor do cliente' },
                    { n: '02', t: 'Planeamento', d: 'Desenvolvemos a estratégia' },
                    { n: '03', t: 'Execução', d: 'Implementamos a solução' },
                    { n: '04', t: 'Sustentação', d: 'Suporte e manutenção contínua' },
                  ].map(item => (
                    <div key={item.n} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-3">
                      <p className="text-blue-400 text-xs font-mono mb-1">{item.n}</p>
                      <p className="text-white text-sm font-medium">{item.t}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">{item.d}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Portfólio */}
              <div>
                <h3 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-600/20 flex items-center justify-center text-blue-400 text-xs">3</span>
                  Portfólio de Serviços
                </h3>
                <div className="space-y-3">
                  {[
                    {
                      cat: 'A · Desenvolvimento e Software',
                      items: ['Criação de Software personalizado para gestão e automação', 'Desenvolvimento Web: plataformas, e-commerce e portais corporativos']
                    },
                    {
                      cat: 'B · Gestão e Infraestrutura',
                      items: ['Consultoria em TI: alinhamento estratégico', 'Outsourcing de TI: gestão de departamentos externos', 'Implementação de redes, cloud e segurança de dados']
                    },
                    {
                      cat: 'C · Suporte e Manutenção',
                      items: ['Suporte técnico remoto ou presencial', 'Reparação e manutenção de hardware e software']
                    },
                    {
                      cat: 'D · Educação Tecnológica',
                      items: ['Formação em programação, redes, cibersegurança e literacia digital']
                    },
                  ].map(section => (
                    <div key={section.cat} className="bg-zinc-800/40 border border-zinc-700/40 rounded-xl p-4">
                      <p className="text-blue-400 text-xs font-medium mb-2">{section.cat}</p>
                      {section.items.map(item => (
                        <div key={item} className="flex items-start gap-2 mb-1">
                          <span className="text-blue-500 text-xs mt-0.5">→</span>
                          <p className="text-zinc-400 text-xs">{item}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Impacto */}
              <div>
                <h3 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-600/20 flex items-center justify-center text-blue-400 text-xs">4</span>
                  Impacto na Sociedade
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { t: 'Inclusão Digital', d: 'Formação e capacitação para jovens e profissionais entrarem no mercado tecnológico.' },
                    { t: 'Eficiência Local', d: 'Modernização de PMEs para tornar a economia local mais competitiva globalmente.' },
                    { t: 'Sustentabilidade Tecnológica', d: 'Manutenção prolonga a vida de equipamentos, reduzindo lixo eletrónico.' },
                  ].map(item => (
                    <div key={item.t} className="flex items-start gap-3 bg-zinc-800/40 border border-zinc-700/40 rounded-xl p-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-white text-sm font-medium">{item.t}</p>
                        <p className="text-zinc-500 text-xs mt-0.5">{item.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Por que escolher */}
              <div>
                <h3 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-600/20 flex items-center justify-center text-blue-400 text-xs">5</span>
                  Por que Escolher a M.A CODE?
                </h3>
                <div className="space-y-2">
                  {[
                    { t: 'Expertise Multidisciplinar', d: 'Cobrimos desde o código (Software) até ao parafuso (Hardware).' },
                    { t: 'Abordagem Consultiva', d: 'Não vendemos o que é mais caro, mas o que é mais adequado.' },
                    { t: 'Foco no Cliente', d: 'Suporte ágil e humano, focado na continuidade do seu negócio.' },
                  ].map(item => (
                    <div key={item.t} className="flex gap-3 items-start">
                      <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-zinc-400 text-sm"><span className="text-white font-medium">{item.t}:</span> {item.d}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contacto */}
              <div className="pt-2 border-t border-zinc-800">
                <a
                  href="https://wa.me/244937999343"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-green-600/10 hover:bg-green-600/20 border border-green-600/20 text-green-400 font-medium py-3 rounded-xl transition text-sm"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.528 5.847L.057 23.428a.75.75 0 00.921.921l5.579-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.718 9.718 0 01-4.953-1.354l-.355-.211-3.676.969.983-3.593-.232-.371A9.718 9.718 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                  </svg>
                  Contactar M.A CODE via WhatsApp
                </a>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  )
}
