import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from './lib/firebase'
import { formatDateTime, formatMessageTime, friendlyAuthError, initials } from './lib/format'
import type { BlockRecord, ChatMessage, DirectConversation, FriendRequest, Friendship, MessageReport, PublicProfile, Room, UserProfile, UserRole, UserStatus } from './types'
import { Icon } from './components/Icon'

type Route = 'chat' | 'admin'
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const NOTIFICATION_KEY = 'nagi-notifications-enabled'
let pendingInstallPrompt: BeforeInstallPromptEvent | null = null

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  pendingInstallPrompt = event as BeforeInstallPromptEvent
})
window.addEventListener('appinstalled', () => { pendingInstallPrompt = null })

async function showIncomingNotification(name: string, message: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted' || localStorage.getItem(NOTIFICATION_KEY) !== 'true') return
  const options = { body: message, icon: `${import.meta.env.BASE_URL}nagi-icon.svg`, badge: `${import.meta.env.BASE_URL}nagi-icon.svg`, tag: `nagi-${name}`, renotify: true }
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(`${name}さんからのメッセージ`, options)
  } else {
    new Notification(`${name}さんからのメッセージ`, options)
  }
}

const demoProfile: UserProfile = {
  id: 'demo-user', displayName: 'なぎ 太郎', email: 'demo@example.com', photoURL: null, role: 'admin', status: 'active',
}
const demoRooms: Room[] = [
  { id: 'general', name: 'ラウンジ', description: 'みんなで気軽に話す場所', type: 'public', isArchived: false, createdBy: 'demo-user' },
  { id: 'ideas', name: 'アイデア', description: '思いついたことを共有する場所', type: 'public', isArchived: false, createdBy: 'demo-user' },
  { id: 'music', name: '音楽', description: '最近聴いている音楽の話', type: 'public', isArchived: false, createdBy: 'demo-user' },
]
const demoConversations: DirectConversation[] = [
  { id: 'demo-user_member-1', participantIds: ['demo-user', 'member-1'], participantProfiles: { 'demo-user': { displayName: 'なぎ 太郎', photoURL: null }, 'member-1': { displayName: '水野 あおい', photoURL: null } }, lastMessage: 'こんにちは。今日もゆっくり話しましょう。', lastSenderId: 'member-1', unreadCounts: { 'demo-user': 2, 'member-1': 0 }, readAt: { 'demo-user': Timestamp.fromDate(new Date(Date.now() - 25 * 60_000)), 'member-1': Timestamp.fromDate(new Date(Date.now() - 4 * 60_000)) }, lastMessageAt: Timestamp.fromDate(new Date(Date.now() - 18 * 60_000)) },
  { id: 'demo-user_member-2', participantIds: ['demo-user', 'member-2'], participantProfiles: { 'demo-user': { displayName: 'なぎ 太郎', photoURL: null }, 'member-2': { displayName: '佐倉 凛', photoURL: null } }, lastMessage: 'またあとで話しましょう。', lastSenderId: 'member-2', unreadCounts: { 'demo-user': 3, 'member-2': 0 }, readAt: { 'demo-user': Timestamp.fromDate(new Date(Date.now() - 80 * 60_000)), 'member-2': Timestamp.fromDate(new Date(Date.now() - 55 * 60_000)) }, lastMessageAt: Timestamp.fromDate(new Date(Date.now() - 65 * 60_000)) },
]
const demoMessages: ChatMessage[] = [
  { id: 'demo-1', text: 'こんにちは。今日もゆっくり話しましょう。', senderId: 'member-1', senderName: '水野 あおい', senderPhotoURL: null, isHidden: false, createdAt: Timestamp.fromDate(new Date(Date.now() - 18 * 60_000)) },
  { id: 'demo-2', text: '新しいチャット、落ち着いた雰囲気でいいですね。', senderId: 'demo-user', senderName: 'なぎ 太郎', senderPhotoURL: null, isHidden: false, reactions: { 'member-1': '👍' }, createdAt: Timestamp.fromDate(new Date(Date.now() - 12 * 60_000)) },
  { id: 'demo-3', text: 'うん。余白があると会話に集中しやすい気がします。', senderId: 'member-1', senderName: '水野 あおい', senderPhotoURL: null, isHidden: false, replyTo: { messageId: 'demo-2', senderName: 'なぎ 太郎', text: '新しいチャット、落ち着いた雰囲気でいいですね。' }, reactions: {}, createdAt: Timestamp.fromDate(new Date(Date.now() - 5 * 60_000)) },
]
const demoUsers: UserProfile[] = [
  demoProfile,
  { id: 'member-1', displayName: '水野 あおい', email: 'aoi@example.com', photoURL: null, role: 'member', status: 'active' },
  { id: 'member-2', displayName: '佐倉 凛', email: 'rin@example.com', photoURL: null, role: 'member', status: 'active' },
  { id: 'member-3', displayName: '山本 海', email: 'umi@example.com', photoURL: null, role: 'member', status: 'suspended' },
]
const demoPublicProfiles: PublicProfile[] = [
  { id: 'demo-user', displayName: 'なぎ 太郎', photoURL: null, friendCode: 'NG-DEMO-TARO-01' },
  { id: 'member-1', displayName: '水野 あおい', photoURL: null, friendCode: 'NG-AOI0-0000-01' },
  { id: 'member-2', displayName: '佐倉 凛', photoURL: null, friendCode: 'NG-RIN0-0000-02' },
  { id: 'member-3', displayName: '山本 海', photoURL: null, friendCode: 'NG-UMI0-0000-03' },
]
const demoFriendships: Friendship[] = demoPublicProfiles.slice(1, 3).map((target) => ({
  id: ['demo-user', target.id].sort().join('_'),
  memberIds: ['demo-user', target.id].sort(),
  memberProfiles: {
    'demo-user': { displayName: demoPublicProfiles[0].displayName, photoURL: null, friendCode: demoPublicProfiles[0].friendCode },
    [target.id]: { displayName: target.displayName, photoURL: target.photoURL, friendCode: target.friendCode },
  },
}))
const demoFriendRequests: FriendRequest[] = [{
  id: 'member-3_demo-user', fromUid: 'member-3', toUid: 'demo-user', status: 'pending',
  fromProfile: { displayName: '山本 海', photoURL: null, friendCode: 'NG-UMI0-0000-03' },
  toProfile: { displayName: 'なぎ 太郎', photoURL: null, friendCode: 'NG-DEMO-TARO-01' },
}]
const demoReports: MessageReport[] = [
  { id: 'demo-report', targetType: 'conversation', targetId: 'demo-user_member-2', messageId: 'reported-message', messagePreview: 'この文章は管理者による確認待ちのサンプルです。', reportedBy: 'member-2', reason: '不適切な内容', status: 'pending', createdAt: Timestamp.fromDate(new Date(Date.now() - 25 * 60_000)) },
]

function currentRoute(): Route {
  return window.location.hash === '#/admin' ? 'admin' : 'chat'
}

function friendCodeForUid(uid: string): string {
  const body = uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase().padEnd(12, '0')
  return `NG-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`
}

function pairId(firstUid: string, secondUid: string): string {
  return [firstUid, secondUid].sort().join('_')
}

async function ensureUserProfile(user: User): Promise<void> {
  if (!db) return
  const ref = doc(db, 'users', user.uid)
  const snapshot = await getDoc(ref)
  const tokenResult = await user.getIdTokenResult()
  const bootstrapAdmin = tokenResult.claims.admin === true

  if (!snapshot.exists()) {
    await setDoc(ref, {
      displayName: user.displayName?.trim() || user.email?.split('@')[0] || 'メンバー',
      email: user.email ?? '',
      photoURL: user.photoURL ?? null,
      role: bootstrapAdmin ? 'admin' : 'member',
      status: 'active',
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    })
  } else {
    await updateDoc(ref, {
      lastSeenAt: serverTimestamp(),
      ...(bootstrapAdmin ? { role: 'admin' } : {}),
    })
  }

  const friendCode = friendCodeForUid(user.uid)
  const friendCodeRef = doc(db, 'friendCodes', friendCode)
  const publicProfileRef = doc(db, 'publicProfiles', user.uid)
  const publicProfile = {
    displayName: user.displayName?.trim() || user.email?.split('@')[0] || 'メンバー',
    photoURL: user.photoURL ?? null,
    friendCode,
    updatedAt: serverTimestamp(),
  }
  const friendCodeSnapshot = await getDoc(friendCodeRef)
  if (!friendCodeSnapshot.exists()) {
    const batch = writeBatch(db)
    batch.set(friendCodeRef, { uid: user.uid, createdAt: serverTimestamp() })
    batch.set(publicProfileRef, publicProfile, { merge: true })
    await batch.commit()
  } else {
    await setDoc(publicProfileRef, publicProfile, { merge: true })
  }

  const generalRef = doc(db, 'rooms', 'general')
  if (!(await getDoc(generalRef)).exists()) {
    await setDoc(generalRef, {
      name: 'ラウンジ',
      description: 'みんなで気軽に話す場所',
      type: 'public',
      isArchived: false,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    })
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [route, setRoute] = useState<Route>(currentRoute)
  const [startupError, setStartupError] = useState('')
  const preview = new URLSearchParams(window.location.search).get('preview')

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false)
      return
    }

    const firebaseAuth = auth
    const firestore = db
    let unsubscribeProfile: () => void = () => undefined
    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      unsubscribeProfile()
      setUser(nextUser)
      setProfile(null)
      setStartupError('')
      if (!nextUser) {
        setLoading(false)
        return
      }

      try {
        await ensureUserProfile(nextUser)
        unsubscribeProfile = onSnapshot(doc(firestore, 'users', nextUser.uid), (snapshot) => {
          if (snapshot.exists()) {
            setProfile({ id: snapshot.id, ...snapshot.data() } as UserProfile)
          }
          setLoading(false)
        }, (error) => {
          setStartupError(friendlyAuthError(error))
          setLoading(false)
        })
      } catch (error) {
        setStartupError(friendlyAuthError(error))
        setLoading(false)
      }
    })

    return () => {
      unsubscribeAuth()
      unsubscribeProfile()
    }
  }, [])

  if (import.meta.env.DEV && preview === 'chat') return <ChatShell user={{ uid: 'demo-user' }} profile={demoProfile} demo />
  if (import.meta.env.DEV && preview === 'admin') return <AdminPanel user={{ uid: 'demo-user' }} profile={demoProfile} demo />
  if (!isFirebaseConfigured) {
    if (preview === 'chat') return <ChatShell user={{ uid: 'demo-user' }} profile={demoProfile} demo />
    if (preview === 'admin') return <AdminPanel user={{ uid: 'demo-user' }} profile={demoProfile} demo />
    return <SetupScreen />
  }
  if (loading) return <LoadingScreen />
  if (!user) return <AuthScreen />
  if (startupError) return <ErrorScreen message={startupError} onLogout={() => auth && signOut(auth)} />
  if (!profile) return <LoadingScreen />
  if (profile.status === 'suspended') return <SuspendedScreen onLogout={() => auth && signOut(auth)} />
  if (route === 'admin') return <AdminPanel user={user} profile={profile} />
  return <ChatShell user={user} profile={profile} />
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <span className="brand-mark"><span /></span>
      <span className="brand-name">Nagi</span>
    </div>
  )
}

function LoadingScreen() {
  return <main className="center-screen"><div className="loading-mark"><span /></div><p>読み込んでいます</p></main>
}

function SetupScreen() {
  return (
    <main className="setup-screen">
      <section className="setup-card">
        <Brand />
        <span className="eyebrow">SETUP REQUIRED</span>
        <h1>Firebaseとの接続待ちです</h1>
        <p>アプリ本体は準備できています。Firebase Web Appの設定値を環境変数へ追加すると、チャットが起動します。</p>
        <div className="preview-actions"><a className="button button--primary" href="?preview=chat#/">チャットをプレビュー</a><a className="button button--ghost" href="?preview=admin#/admin">管理画面を見る</a></div>
        <div className="setup-note"><Icon name="alert" /><span>プレビューはサンプルデータです。Firebase接続後に実際の会話が有効になります。</span></div>
      </section>
    </main>
  )
}

function ErrorScreen({ message, onLogout }: { message: string; onLogout: () => void }) {
  return (
    <main className="center-screen">
      <div className="status-card"><Icon name="alert" /><h1>接続できませんでした</h1><p>{message}</p><button className="button button--primary" onClick={() => location.reload()}>再読み込み</button><button className="text-button" onClick={onLogout}>ログアウト</button></div>
    </main>
  )
}

function SuspendedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <main className="center-screen">
      <div className="status-card"><Icon name="shield" /><h1>アカウントは利用停止中です</h1><p>管理者によって利用が一時停止されています。</p><button className="button button--secondary" onClick={onLogout}>ログアウト</button></div>
    </main>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!auth) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
        await updateProfile(credential.user, { displayName: name.trim() })
        await sendEmailVerification(credential.user)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (authError) {
      setError(friendlyAuthError(authError))
      setBusy(false)
    }
  }

  const googleLogin = async () => {
    if (!auth) return
    setBusy(true)
    setError('')
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (authError) {
      setError(friendlyAuthError(authError))
      setBusy(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <Brand />
        <div className="auth-copy"><span className="eyebrow">A QUIET PLACE TO TALK</span><h1>言葉が、自然に<br />つながる場所。</h1><p>気負わずに話せる、シンプルなチャットスペースです。</p></div>
        <div className="auth-orbit auth-orbit--one" /><div className="auth-orbit auth-orbit--two" />
        <p className="auth-footnote">穏やかに、いつもの会話を。</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand"><Brand /></div>
          <span className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'JOIN NAGI'}</span>
          <h2>{mode === 'login' ? 'おかえりなさい' : 'アカウントを作成'}</h2>
          <p className="auth-subtitle">{mode === 'login' ? '続けるにはログインしてください。' : 'すぐに会話を始められます。'}</p>
          <button className="google-button" type="button" onClick={googleLogin} disabled={busy}><span className="google-g">G</span>Googleで続ける</button>
          <div className="divider"><span>または</span></div>
          <form onSubmit={submit}>
            {mode === 'register' && <label>表示名<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={30} placeholder="なぎ 太郎" /></label>}
            <label>メールアドレス<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com" /></label>
            <label>パスワード<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required placeholder="8文字以上" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button--primary button--full" disabled={busy}>{busy ? '処理中…' : mode === 'login' ? 'ログイン' : 'はじめる'}</button>
          </form>
          <p className="auth-switch">{mode === 'login' ? 'はじめてですか？' : 'アカウントをお持ちですか？'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? '新規登録' : 'ログイン'}</button></p>
        </div>
      </section>
    </main>
  )
}

function Avatar({ name, photoURL, size = 'md' }: { name: string; photoURL: string | null; size?: 'sm' | 'md' | 'lg' }) {
  return photoURL ? <img className={`avatar avatar--${size}`} src={photoURL} alt="" referrerPolicy="no-referrer" /> : <span className={`avatar avatar--${size} avatar--fallback`}>{initials(name)}</span>
}

function ChatShell({ user, profile, demo = false }: { user: Pick<User, 'uid'>; profile: UserProfile; demo?: boolean }) {
  const [rooms, setRooms] = useState<Room[]>(demo ? demoRooms : [])
  const [allConversations, setAllConversations] = useState<DirectConversation[]>(demo ? demoConversations : [])
  const [friendshipIds, setFriendshipIds] = useState<string[]>(demo ? demoFriendships.map((item) => item.id) : [])
  const [activeKind, setActiveKind] = useState<'conversation' | 'room'>(demo ? 'conversation' : 'room')
  const [selectedConversationId, setSelectedConversationId] = useState(demo ? demoConversations[0].id : '')
  const [selectedRoomId, setSelectedRoomId] = useState('general')
  const [messages, setMessages] = useState<ChatMessage[]>(demo ? demoMessages : [])
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([])
  const [oldestCursor, setOldestCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [hasOlder, setHasOlder] = useState(demo)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [text, setText] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(demo && new URLSearchParams(window.location.search).get('profile') === '1')
  const [newDirectOpen, setNewDirectOpen] = useState(demo && new URLSearchParams(window.location.search).get('friends') === '1')
  const [newRoomOpen, setNewRoomOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeConversationRef = useRef('')
  const seenConversationTimes = useRef<Record<string, number>>({})

  const conversations = useMemo(() => allConversations.filter((item) => friendshipIds.includes(item.id)), [allConversations, friendshipIds])
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId), [rooms, selectedRoomId])
  const selectedConversation = useMemo(() => conversations.find((item) => item.id === selectedConversationId), [conversations, selectedConversationId])
  const otherParticipant = selectedConversation?.participantIds.find((id) => id !== user.uid)
  const otherProfile = otherParticipant ? selectedConversation?.participantProfiles[otherParticipant] : undefined
  const activeId = activeKind === 'conversation' ? selectedConversationId : selectedRoomId
  const allMessages = [...olderMessages, ...messages]
  const otherReadAt = otherParticipant ? selectedConversation?.readAt?.[otherParticipant] : undefined
  const totalUnread = conversations.reduce((total, conversation) => total + (conversation.unreadCounts?.[user.uid] ?? 0), 0)

  useEffect(() => {
    activeConversationRef.current = activeKind === 'conversation' ? selectedConversationId : ''
  }, [activeKind, selectedConversationId])

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Nagi — Chat` : 'Nagi — Chat'
    return () => { document.title = 'Nagi — Chat' }
  }, [totalUnread])

  useEffect(() => {
    if (demo || !db) return
    return onSnapshot(query(collection(db, 'friendships'), where('memberIds', 'array-contains', user.uid), limit(100)), (snapshot) => {
      setFriendshipIds(snapshot.docs.map((item) => item.id))
    }, () => setNotice('友達一覧を読み込めませんでした。'))
  }, [demo, user.uid])

  useEffect(() => {
    if (demo || !db) return
    const conversationsById = new Map<string, DirectConversation>()
    setAllConversations([])
    const syncConversations = () => {
      setAllConversations([...conversationsById.values()].sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)))
    }
    const stops = friendshipIds.map((friendshipId) => onSnapshot(doc(db!, 'conversations', friendshipId), (snapshot) => {
      if (snapshot.exists()) {
        const conversation = { id: snapshot.id, ...snapshot.data() } as DirectConversation
        const messageTime = conversation.lastMessageAt?.toMillis() ?? 0
        const previousTime = seenConversationTimes.current[snapshot.id]
        if (previousTime !== undefined && messageTime > previousTime && conversation.lastSenderId !== user.uid && conversation.lastMessage && activeConversationRef.current !== snapshot.id) {
          const sender = conversation.participantProfiles[conversation.lastSenderId]
          void showIncomingNotification(sender?.displayName ?? '友達', conversation.lastMessage)
        }
        seenConversationTimes.current[snapshot.id] = messageTime
        conversationsById.set(snapshot.id, conversation)
      } else conversationsById.delete(snapshot.id)
      syncConversations()
    }, () => setNotice('個別チャットを読み込めませんでした。')))
    return () => stops.forEach((stop) => stop())
  }, [demo, friendshipIds, user.uid])

  useEffect(() => {
    if (!selectedConversationId && conversations.length) {
      setSelectedConversationId(conversations[0].id)
      setActiveKind('conversation')
    }
  }, [conversations, selectedConversationId])

  useEffect(() => {
    if (activeKind !== 'conversation' || !selectedConversation) return
    if (demo) {
      if ((selectedConversation.unreadCounts?.[user.uid] ?? 0) > 0) {
        setAllConversations((current) => current.map((conversation) => conversation.id === selectedConversation.id ? { ...conversation, unreadCounts: { ...conversation.unreadCounts, [user.uid]: 0 }, readAt: { ...conversation.readAt, [user.uid]: Timestamp.now() } } : conversation))
      }
      return
    }
    if (!db) return
    const initializeOrRead = async () => {
      try {
        if (!selectedConversation.unreadCounts || !selectedConversation.readAt || selectedConversation.lastSenderId === undefined) {
          const otherId = selectedConversation.participantIds.find((id) => id !== user.uid) ?? ''
          await updateDoc(doc(db!, 'conversations', selectedConversation.id), {
            unreadCounts: { [user.uid]: 0, [otherId]: 0 },
            readAt: { [user.uid]: serverTimestamp(), [otherId]: Timestamp.fromMillis(0) },
            lastSenderId: selectedConversation.lastSenderId ?? '',
          })
        } else if ((selectedConversation.unreadCounts[user.uid] ?? 0) > 0) {
          await updateDoc(doc(db!, 'conversations', selectedConversation.id), {
            [`unreadCounts.${user.uid}`]: 0,
            [`readAt.${user.uid}`]: serverTimestamp(),
          })
        }
      } catch (error) { setNotice(friendlyAuthError(error)) }
    }
    void initializeOrRead()
  }, [activeKind, demo, selectedConversation, user.uid])

  useEffect(() => {
    if (demo) return
    if (!db) return
    return onSnapshot(query(collection(db, 'rooms'), where('isArchived', '==', false)), (snapshot) => {
      const nextRooms = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Room))
      nextRooms.sort((a, b) => a.id === 'general' ? -1 : b.id === 'general' ? 1 : a.name.localeCompare(b.name, 'ja'))
      setRooms(nextRooms)
      if (nextRooms.length && !nextRooms.some((room) => room.id === selectedRoomId)) setSelectedRoomId(nextRooms[0].id)
    }, () => setNotice('チャンネルを読み込めませんでした。'))
  }, [demo, selectedRoomId])

  useEffect(() => {
    if (demo) return
    if (!db || !activeId) return
    setOlderMessages([])
    setOldestCursor(null)
    const parentCollection = activeKind === 'conversation' ? 'conversations' : 'rooms'
    const messagesQuery = query(collection(db, parentCollection, activeId, 'messages'), orderBy('createdAt', 'desc'), limit(50))
    return onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatMessage)).reverse())
      setOldestCursor((current) => current ?? snapshot.docs.at(-1) ?? null)
      setHasOlder(snapshot.size === 50)
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
    }, () => setNotice('メッセージを読み込めませんでした。'))
  }, [activeId, activeKind, demo])

  const loadOlder = async () => {
    if (demo) { setHasOlder(false); setNotice('プレビューでは、ここにさらに過去のメッセージが追加されます。'); return }
    if (!db || !activeId || !oldestCursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const parentCollection = activeKind === 'conversation' ? 'conversations' : 'rooms'
      const snapshot = await getDocs(query(collection(db, parentCollection, activeId, 'messages'), orderBy('createdAt', 'desc'), startAfter(oldestCursor), limit(50)))
      const older = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatMessage)).reverse()
      setOlderMessages((current) => [...older, ...current])
      setOldestCursor(snapshot.docs.at(-1) ?? oldestCursor)
      setHasOlder(snapshot.size === 50)
    } catch (error) { setNotice(friendlyAuthError(error)) } finally { setLoadingOlder(false) }
  }

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault()
    const cleanText = text.trim()
    if (!cleanText || sending) return
    if (activeKind === 'conversation' && (!selectedConversation || !otherParticipant)) {
      setNotice('会話の相手を確認できませんでした。友達一覧から開き直してください。')
      return
    }
    setText('')
    if (demo) {
      setMessages((current) => [...current, { id: `demo-${Date.now()}`, text: cleanText, senderId: user.uid, senderName: profile.displayName, senderPhotoURL: profile.photoURL, isHidden: false, reactions: {}, ...(replyingTo ? { replyTo: { messageId: replyingTo.id, senderName: replyingTo.senderName, text: replyingTo.text.slice(0, 100) } } : {}), createdAt: Timestamp.now() }])
      setReplyingTo(null)
      return
    }
    if (!db) return
    setSending(true)
    try {
      const parentCollection = activeKind === 'conversation' ? 'conversations' : 'rooms'
      if (activeKind === 'conversation' && selectedConversation && (!selectedConversation.unreadCounts || !selectedConversation.readAt || selectedConversation.lastSenderId === undefined)) {
        const targetId = selectedConversation.participantIds.find((id) => id !== user.uid) ?? ''
        await updateDoc(doc(db, 'conversations', activeId), { unreadCounts: { [user.uid]: 0, [targetId]: 0 }, readAt: { [user.uid]: serverTimestamp(), [targetId]: Timestamp.fromMillis(0) }, lastSenderId: selectedConversation.lastSenderId ?? '' })
      }
      const messageRef = doc(collection(db, parentCollection, activeId, 'messages'))
      const batch = writeBatch(db)
      batch.set(messageRef, {
        text: cleanText,
        senderId: user.uid,
        senderName: profile.displayName,
        senderPhotoURL: profile.photoURL,
        isHidden: false,
        reactions: {},
        ...(replyingTo ? { replyTo: { messageId: replyingTo.id, senderName: replyingTo.senderName, text: replyingTo.text.slice(0, 100) } } : {}),
        createdAt: serverTimestamp(),
      })
      if (activeKind === 'conversation') {
        const targetId = selectedConversation?.participantIds.find((id) => id !== user.uid) ?? ''
        batch.update(doc(db, 'conversations', activeId), { lastMessage: cleanText.slice(0, 100), lastSenderId: user.uid, [`unreadCounts.${targetId}`]: increment(1), lastMessageAt: serverTimestamp(), updatedAt: serverTimestamp() })
      }
      await batch.commit()
      setReplyingTo(null)
    } catch (error) {
      setText(cleanText)
      setNotice(friendlyAuthError(error))
    } finally {
      setSending(false)
    }
  }

  const toggleReaction = async (message: ChatMessage, emoji: '👍' | '❤️' | '😂') => {
    const currentReaction = message.reactions?.[user.uid]
    if (demo) {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, reactions: { ...item.reactions, [user.uid]: currentReaction === emoji ? undefined : emoji } as ChatMessage['reactions'] } : item))
      return
    }
    if (!db) return
    const parentCollection = activeKind === 'conversation' ? 'conversations' : 'rooms'
    try {
      await updateDoc(doc(db, parentCollection, activeId, 'messages', message.id), { [`reactions.${user.uid}`]: currentReaction === emoji ? deleteField() : emoji })
    } catch (error) { setNotice(friendlyAuthError(error)) }
  }

  const reportMessage = async (message: ChatMessage) => {
    if (message.senderId === user.uid) return
    if (!window.confirm('このメッセージを管理者へ報告しますか？')) return
    if (demo) { setNotice('プレビュー：管理者へ報告しました。'); return }
    if (!db) return
    try {
      await setDoc(doc(db, 'reports', `${user.uid}_${message.id}`), {
        targetType: activeKind,
        targetId: activeId,
        messageId: message.id,
        messagePreview: message.text.slice(0, 140),
        reportedBy: user.uid,
        reason: '不適切な内容',
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setNotice('管理者へ報告しました。')
    } catch (error) {
      setNotice(friendlyAuthError(error))
    }
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="メニューを閉じる" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar-top"><Brand compact /><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="閉じる"><Icon name="close" /></button></div>
        <div className="sidebar-label"><span>メッセージ</span><button className="icon-button icon-button--small" onClick={() => setNewDirectOpen(true)} aria-label="友達を開く"><Icon name="users" /></button></div>
        <nav className="room-list direct-list" aria-label="個別チャット一覧">
          {conversations.map((conversation) => {
            const otherId = conversation.participantIds.find((id) => id !== user.uid)
            const other = otherId ? conversation.participantProfiles[otherId] : undefined
            const unread = conversation.unreadCounts?.[user.uid] ?? 0
            return <button key={conversation.id} className={`room-item direct-item ${activeKind === 'conversation' && selectedConversationId === conversation.id ? 'room-item--active' : ''}`} onClick={() => { setActiveKind('conversation'); setSelectedConversationId(conversation.id); setSidebarOpen(false) }}><Avatar name={other?.displayName ?? 'メンバー'} photoURL={other?.photoURL ?? null} size="sm" /><span><strong>{other?.displayName ?? 'メンバー'}</strong><small>{conversation.lastMessage || '会話を始めましょう'}</small></span>{unread > 0 && <b className="unread-badge">{unread > 99 ? '99+' : unread}</b>}</button>
          })}
          {!conversations.length && <button className="empty-direct" onClick={() => setNewDirectOpen(true)}><Icon name="users" />友達を追加して話す</button>}
        </nav>
        <div className="sidebar-label sidebar-label--channels"><span>チャンネル</span><button className="icon-button icon-button--small" onClick={() => setNewRoomOpen(true)} aria-label="チャンネルを追加"><Icon name="plus" /></button></div>
        <nav className="room-list" aria-label="チャンネル一覧">
          {rooms.map((room) => <button key={room.id} className={`room-item ${activeKind === 'room' && selectedRoomId === room.id ? 'room-item--active' : ''}`} onClick={() => { setActiveKind('room'); setSelectedRoomId(room.id); setSidebarOpen(false) }}><Icon name="hash" /><span>{room.name}</span></button>)}
        </nav>
        <div className="sidebar-spacer" />
        {profile.role === 'admin' && <a className="admin-link" href={demo ? '?preview=admin#/admin' : '#/admin'}><Icon name="shield" />管理ページ</a>}
        <button className="profile-summary" onClick={() => setProfileOpen(true)}><Avatar name={profile.displayName} photoURL={profile.photoURL} /><span><strong>{profile.displayName}</strong><small>{profile.role === 'admin' ? '管理者' : 'オンライン'}</small></span><Icon name="more" /></button>
      </aside>
      <main className="chat-main">
        <header className="chat-header"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="メニュー"><Icon name="menu" /></button><div className="channel-heading"><div>{activeKind === 'conversation' ? <Avatar name={otherProfile?.displayName ?? 'メンバー'} photoURL={otherProfile?.photoURL ?? null} size="sm" /> : <Icon name="hash" />}<h1>{activeKind === 'conversation' ? otherProfile?.displayName ?? '個別チャット' : selectedRoom?.name ?? 'チャンネル'}</h1></div><p>{activeKind === 'conversation' ? '1対1の個別チャット' : selectedRoom?.description ?? ''}</p></div><div className="header-meta"><span className="presence-dot" />Live</div></header>
        <section className="message-area" aria-live="polite">
          <div className="channel-intro"><span className="channel-icon">{activeKind === 'conversation' ? <Icon name="message" /> : <Icon name="hash" />}</span><h2>{activeKind === 'conversation' ? `${otherProfile?.displayName ?? '相手'}さんとの会話` : `${selectedRoom?.name ?? 'チャンネル'}へようこそ`}</h2><p>{activeKind === 'conversation' ? 'ここでのメッセージは、この会話の参加者だけが読めます。' : selectedRoom?.description || 'ここから会話が始まります。'}</p></div>
          {hasOlder && <button className="load-older" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? '読み込み中…' : '過去のメッセージを読み込む'}</button>}
          {allMessages.map((message, index) => {
            const previous = allMessages[index - 1]
            const grouped = previous?.senderId === message.senderId
            const reactionCounts = Object.values(message.reactions ?? {}).filter(Boolean).reduce<Record<string, number>>((counts, emoji) => ({ ...counts, [emoji]: (counts[emoji] ?? 0) + 1 }), {})
            const isRead = activeKind === 'conversation' && message.senderId === user.uid && Boolean(message.createdAt && otherReadAt && message.createdAt.toMillis() <= otherReadAt.toMillis())
            return <article className={`message ${grouped ? 'message--grouped' : ''}`} key={message.id}>{!grouped && <Avatar name={message.senderName} photoURL={message.senderPhotoURL} />}<div className="message-body">{!grouped && <div className="message-meta"><strong>{message.senderName}</strong><time>{formatMessageTime(message.createdAt)}</time></div>}{message.replyTo && <div className="reply-quote"><strong>{message.replyTo.senderName}</strong><span>{message.replyTo.text}</span></div>}<p className={message.isHidden ? 'message-hidden' : ''}>{message.isHidden ? 'このメッセージは管理者により非表示になりました。' : message.text}</p>{Object.keys(reactionCounts).length > 0 && <div className="reaction-summary">{Object.entries(reactionCounts).map(([emoji, count]) => <button key={emoji} className={message.reactions?.[user.uid] === emoji ? 'active' : ''} onClick={() => toggleReaction(message, emoji as '👍' | '❤️' | '😂')}>{emoji} <span>{count}</span></button>)}</div>}{isRead && <span className="read-receipt">既読</span>}</div>{!message.isHidden && <div className="message-actions"><button onClick={() => setReplyingTo(message)} aria-label="返信"><Icon name="reply" /></button>{(['👍', '❤️', '😂'] as const).map((emoji) => <button key={emoji} className="emoji-action" onClick={() => toggleReaction(message, emoji)} aria-label={`${emoji}でリアクション`}>{emoji}</button>)}{message.senderId !== user.uid && <button onClick={() => reportMessage(message)} aria-label="報告"><Icon name="flag" /></button>}</div>}</article>
          })}
          <div ref={messagesEndRef} />
        </section>
        <form className={`composer ${replyingTo ? 'composer--replying' : ''}`} onSubmit={sendMessage}>{replyingTo && <div className="replying-banner"><Icon name="reply" /><span><strong>{replyingTo.senderName}さんへ返信</strong><small>{replyingTo.text}</small></span><button type="button" onClick={() => setReplyingTo(null)} aria-label="返信をやめる"><Icon name="close" /></button></div>}<textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }} maxLength={1000} rows={1} placeholder={activeKind === 'conversation' ? `${otherProfile?.displayName ?? '相手'}さんにメッセージ` : `#${selectedRoom?.name ?? 'チャンネル'} にメッセージ`} aria-label="メッセージ" /><button className="send-button" disabled={!text.trim() || sending || !activeId} aria-label="送信"><Icon name="send" /></button><span className="composer-hint">Enterで送信 · Shift + Enterで改行</span></form>
      </main>
      {profileOpen && <ProfileDialog profile={profile} demo={demo} onClose={() => setProfileOpen(false)} />}
      {newDirectOpen && <FriendsDialog user={user} profile={profile} demo={demo} onClose={() => setNewDirectOpen(false)} onCreated={(id) => { setSelectedConversationId(id); setActiveKind('conversation'); setNewDirectOpen(false) }} />}
      {newRoomOpen && (demo ? <Modal title="プレビュー" onClose={() => setNewRoomOpen(false)}><p className="preview-copy">Firebase接続後は、ここから新しい公開チャンネルを作成できます。</p></Modal> : <NewRoomDialog user={user as User} onClose={() => setNewRoomOpen(false)} onCreated={(id) => { setSelectedRoomId(id); setNewRoomOpen(false) }} />)}
      {notice && <div className="toast" role="status"><Icon name="check" />{notice}<button onClick={() => setNotice('')} aria-label="閉じる"><Icon name="close" /></button></div>}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-layer" role="presentation"><button className="modal-backdrop" onClick={onClose} aria-label="閉じる" /><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="閉じる"><Icon name="close" /></button></header>{children}</section></div>
}

function ProfileDialog({ profile, onClose, demo = false }: { profile: UserProfile; onClose: () => void; demo?: boolean }) {
  const [name, setName] = useState(profile.displayName)
  const [busy, setBusy] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem(NOTIFICATION_KEY) === 'true' && 'Notification' in window && Notification.permission === 'granted')
  const [installAvailable, setInstallAvailable] = useState(Boolean(pendingInstallPrompt))
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    if (demo) { onClose(); return }
    if (!db) return
    setBusy(true)
    await updateDoc(doc(db, 'users', profile.id), { displayName: name.trim(), lastSeenAt: serverTimestamp() })
    await setDoc(doc(db, 'publicProfiles', profile.id), { displayName: name.trim(), photoURL: profile.photoURL, updatedAt: serverTimestamp() }, { merge: true })
    if (auth?.currentUser) await updateProfile(auth.currentUser, { displayName: name.trim() })
    onClose()
  }
  const toggleNotifications = async () => {
    if (!('Notification' in window)) return
    if (notificationsEnabled) {
      localStorage.removeItem(NOTIFICATION_KEY)
      setNotificationsEnabled(false)
      return
    }
    const permission = await Notification.requestPermission()
    const enabled = permission === 'granted'
    localStorage.setItem(NOTIFICATION_KEY, String(enabled))
    setNotificationsEnabled(enabled)
  }
  const installApp = async () => {
    if (!pendingInstallPrompt) return
    await pendingInstallPrompt.prompt()
    const choice = await pendingInstallPrompt.userChoice
    if (choice.outcome === 'accepted') pendingInstallPrompt = null
    setInstallAvailable(Boolean(pendingInstallPrompt))
  }
  const friendCode = friendCodeForUid(profile.id)
  return <Modal title="プロフィール" onClose={onClose}><div className="profile-hero"><Avatar name={profile.displayName} photoURL={profile.photoURL} size="lg" /><div><strong>{profile.displayName}</strong><span>{profile.email}</span></div></div><div className="friend-code-card"><span>あなたのNagi ID</span><strong>{friendCode}</strong><button type="button" className="small-button" onClick={() => navigator.clipboard.writeText(friendCode)}>コピー</button></div><div className="app-settings"><button type="button" onClick={toggleNotifications}><Icon name="bell" /><span><strong>ブラウザ通知</strong><small>アプリを開いている間に新着を通知</small></span><b className={notificationsEnabled ? 'toggle-on' : ''}>{notificationsEnabled ? 'ON' : 'OFF'}</b></button>{installAvailable && <button type="button" onClick={installApp}><Icon name="download" /><span><strong>Nagiをインストール</strong><small>ホーム画面からアプリとして開く</small></span><Icon name="back" className="rotate-180" /></button>}</div><form className="modal-form" onSubmit={save}><label>表示名<input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required /></label><button className="button button--primary button--full" disabled={busy}>保存</button><button type="button" className="button button--ghost button--full" onClick={() => auth && signOut(auth)}><Icon name="logout" />ログアウト</button></form></Modal>
}

function FriendsDialog({ user, profile, demo, onClose, onCreated }: { user: Pick<User, 'uid'>; profile: UserProfile; demo: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const previewTab = new URLSearchParams(window.location.search).get('friendsTab')
  const [tab, setTab] = useState<'friends' | 'requests' | 'add' | 'blocked'>(demo && (previewTab === 'requests' || previewTab === 'add' || previewTab === 'blocked') ? previewTab : 'friends')
  const [friendships, setFriendships] = useState<Friendship[]>(demo ? demoFriendships : [])
  const [blocks, setBlocks] = useState<BlockRecord[]>([])
  const [incoming, setIncoming] = useState<FriendRequest[]>(demo ? demoFriendRequests : [])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<PublicProfile | null>(null)
  const [feedback, setFeedback] = useState('')
  const [busyId, setBusyId] = useState('')
  const ownCode = friendCodeForUid(user.uid)

  useEffect(() => {
    if (demo || !db) return
    const stopFriends = onSnapshot(query(collection(db, 'friendships'), where('memberIds', 'array-contains', user.uid), limit(100)), (snapshot) => {
      setFriendships(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Friendship)))
    })
    const stopIncoming = onSnapshot(query(collection(db, 'friendRequests'), where('toUid', '==', user.uid), where('status', '==', 'pending'), limit(50)), (snapshot) => {
      setIncoming(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FriendRequest)))
    })
    const stopOutgoing = onSnapshot(query(collection(db, 'friendRequests'), where('fromUid', '==', user.uid), where('status', '==', 'pending'), limit(50)), (snapshot) => {
      setOutgoing(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FriendRequest)))
    })
    const stopBlocks = onSnapshot(query(collection(db, 'blocks'), where('blockerUid', '==', user.uid), limit(100)), (snapshot) => {
      setBlocks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as BlockRecord)))
    })
    return () => { stopFriends(); stopIncoming(); stopOutgoing(); stopBlocks() }
  }, [demo, user.uid])

  const otherFriend = (friendship: Friendship) => {
    const id = friendship.memberIds.find((memberId) => memberId !== user.uid) ?? ''
    return { id, ...friendship.memberProfiles[id] }
  }

  const startConversation = async (friendship: Friendship) => {
    const target = otherFriend(friendship)
    const conversationId = pairId(user.uid, target.id)
    if (demo) { onCreated(conversationId); return }
    if (!db) return
    setBusyId(target.id)
    setFeedback('')
    try {
      const ref = doc(db, 'conversations', conversationId)
      if (!(await getDoc(ref)).exists()) {
        await setDoc(ref, {
          participantIds: [user.uid, target.id].sort(),
          participantProfiles: {
            [user.uid]: { displayName: profile.displayName, photoURL: profile.photoURL },
            [target.id]: { displayName: target.displayName, photoURL: target.photoURL },
          },
          lastMessage: '', lastSenderId: '', unreadCounts: { [user.uid]: 0, [target.id]: 0 }, readAt: { [user.uid]: serverTimestamp(), [target.id]: serverTimestamp() }, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessageAt: serverTimestamp(),
        })
      }
      onCreated(conversationId)
    } catch (error) { setFeedback(friendlyAuthError(error)) } finally { setBusyId('') }
  }

  const findFriend = async (event: FormEvent) => {
    event.preventDefault()
    const code = search.trim().toUpperCase()
    setResult(null)
    setFeedback('')
    if (!code) return
    if (code === ownCode) { setFeedback('自分自身は追加できません。'); return }
    if (demo) {
      const found = demoPublicProfiles.find((item) => item.friendCode === code) ?? null
      setResult(found)
      if (!found) setFeedback('このNagi IDのユーザーは見つかりませんでした。')
      return
    }
    if (!db) return
    setBusyId('search')
    try {
      const codeSnapshot = await getDoc(doc(db, 'friendCodes', code))
      if (!codeSnapshot.exists()) { setFeedback('このNagi IDのユーザーは見つかりませんでした。'); return }
      const targetUid = codeSnapshot.data().uid as string
      const profileSnapshot = await getDoc(doc(db, 'publicProfiles', targetUid))
      if (!profileSnapshot.exists()) { setFeedback('このユーザーは現在利用できません。'); return }
      setResult({ id: profileSnapshot.id, ...profileSnapshot.data() } as PublicProfile)
    } catch (error) { setFeedback(friendlyAuthError(error)) } finally { setBusyId('') }
  }

  const sendRequest = async (target: PublicProfile) => {
    if (demo) { setFeedback('プレビュー：友達申請を送りました。'); return }
    if (!db) return
    setBusyId(target.id)
    setFeedback('')
    try {
      const requestRef = doc(db, 'friendRequests', `${user.uid}_${target.id}`)
      if ((await getDoc(requestRef)).exists()) await updateDoc(requestRef, { status: 'pending', createdAt: serverTimestamp() })
      else await setDoc(requestRef, { fromUid: user.uid, toUid: target.id, status: 'pending', fromProfile: { displayName: profile.displayName, photoURL: profile.photoURL, friendCode: ownCode }, toProfile: { displayName: target.displayName, photoURL: target.photoURL, friendCode: target.friendCode }, createdAt: serverTimestamp() })
      setFeedback('友達申請を送りました。')
    } catch (error) { setFeedback(friendlyAuthError(error)) } finally { setBusyId('') }
  }

  const removeFriend = async (friendship: Friendship) => {
    const target = otherFriend(friendship)
    if (!window.confirm(`${target.displayName}さんを友達から削除しますか？`)) return
    if (demo) { setFriendships((current) => current.filter((item) => item.id !== friendship.id)); return }
    if (!db) return
    setBusyId(target.id)
    try {
      await deleteDoc(doc(db, 'friendships', friendship.id))
      setFeedback('友達から削除しました。再び話すには友達申請が必要です。')
    } catch (error) { setFeedback(friendlyAuthError(error)) } finally { setBusyId('') }
  }

  const blockFriend = async (friendship: Friendship) => {
    const target = otherFriend(friendship)
    if (!window.confirm(`${target.displayName}さんをブロックしますか？\n友達から削除され、メッセージを送受信できなくなります。`)) return
    if (demo) {
      setFriendships((current) => current.filter((item) => item.id !== friendship.id))
      setBlocks((current) => [...current, { id: `${user.uid}_${target.id}`, blockerUid: user.uid, blockedUid: target.id, friendshipId: friendship.id, blockedProfile: { displayName: target.displayName, photoURL: target.photoURL, friendCode: target.friendCode } }])
      return
    }
    if (!db) return
    setBusyId(target.id)
    try {
      const batch = writeBatch(db)
      batch.set(doc(db, 'blocks', `${user.uid}_${target.id}`), { blockerUid: user.uid, blockedUid: target.id, friendshipId: friendship.id, blockedProfile: { displayName: target.displayName, photoURL: target.photoURL, friendCode: target.friendCode }, createdAt: serverTimestamp() })
      batch.delete(doc(db, 'friendships', friendship.id))
      await batch.commit()
      setFeedback('ブロックしました。')
    } catch (error) { setFeedback(friendlyAuthError(error)) } finally { setBusyId('') }
  }

  const unblock = async (block: BlockRecord) => {
    if (demo) { setBlocks((current) => current.filter((item) => item.id !== block.id)); return }
    if (!db) return
    setBusyId(block.id)
    try {
      await deleteDoc(doc(db, 'blocks', block.id))
      setFeedback('ブロックを解除しました。友達には自動で戻りません。')
    } catch (error) { setFeedback(friendlyAuthError(error)) } finally { setBusyId('') }
  }

  const respondToRequest = async (request: FriendRequest, accept: boolean) => {
    if (demo) {
      setIncoming((current) => current.filter((item) => item.id !== request.id))
      if (accept) {
        const id = pairId(request.fromUid, request.toUid)
        setFriendships((current) => [...current, { id, memberIds: [request.fromUid, request.toUid].sort(), memberProfiles: { [request.fromUid]: request.fromProfile, [request.toUid]: request.toProfile } }])
      }
      return
    }
    if (!db) return
    setBusyId(request.id)
    setFeedback('')
    try {
      if (accept) {
        const friendshipId = pairId(request.fromUid, request.toUid)
        const batch = writeBatch(db)
        batch.set(doc(db, 'friendships', friendshipId), {
          memberIds: [request.fromUid, request.toUid].sort(),
          memberProfiles: { [request.fromUid]: request.fromProfile, [request.toUid]: request.toProfile },
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
        batch.update(doc(db, 'friendRequests', request.id), { status: 'accepted', respondedAt: serverTimestamp() })
        await batch.commit()
        setFeedback('友達に追加しました。')
      } else {
        await updateDoc(doc(db, 'friendRequests', request.id), { status: 'declined', respondedAt: serverTimestamp() })
      }
    } catch (error) { setFeedback(friendlyAuthError(error)) } finally { setBusyId('') }
  }

  const requestState = result ? (blocks.some((item) => item.blockedUid === result.id) ? 'blocked' : friendships.some((item) => item.memberIds.includes(result.id)) ? 'friend' : incoming.find((item) => item.fromUid === result.id) ? 'incoming' : outgoing.some((item) => item.toUid === result.id) ? 'outgoing' : 'none') : 'none'
  const incomingRequest = result ? incoming.find((item) => item.fromUid === result.id) : undefined

  return <Modal title="友達" onClose={onClose}>
    <div className="friend-tabs friend-tabs--four"><button className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}>友達 <span>{friendships.length}</span></button><button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>申請 {incoming.length > 0 && <span>{incoming.length}</span>}</button><button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>追加</button><button className={tab === 'blocked' ? 'active' : ''} onClick={() => setTab('blocked')}>管理</button></div>
    {tab === 'friends' && <div className="friend-panel friend-manage-list">{friendships.map((friendship) => { const target = otherFriend(friendship); return <article key={friendship.id}><button className="friend-main" onClick={() => startConversation(friendship)} disabled={Boolean(busyId)}><Avatar name={target.displayName} photoURL={target.photoURL} /><span><strong>{target.displayName}</strong><small>友達 · トークを開く</small></span><Icon name="message" /></button><div className="friend-actions"><button onClick={() => removeFriend(friendship)} title="友達解除"><Icon name="userMinus" /></button><button className="danger" onClick={() => blockFriend(friendship)} title="ブロック"><Icon name="ban" /></button></div></article> })}{!friendships.length && <div className="friend-empty"><Icon name="users" /><strong>まだ友達がいません</strong><p>「追加」からNagi IDを検索して申請できます。</p></div>}</div>}
    {tab === 'requests' && <div className="request-list">{incoming.map((request) => <article key={request.id}><Avatar name={request.fromProfile.displayName} photoURL={request.fromProfile.photoURL} /><div><strong>{request.fromProfile.displayName}</strong><small>{request.fromProfile.friendCode}</small></div><span><button className="small-button" onClick={() => respondToRequest(request, false)} disabled={Boolean(busyId)}>拒否</button><button className="small-button small-button--primary" onClick={() => respondToRequest(request, true)} disabled={Boolean(busyId)}>追加</button></span></article>)}{!incoming.length && <div className="friend-empty"><Icon name="check" /><strong>新しい申請はありません</strong><p>届いた申請だけがここに表示されます。</p></div>}</div>}
    {tab === 'add' && <div className="friend-add"><div className="friend-code-card"><span>あなたのNagi ID</span><strong>{ownCode}</strong><button type="button" className="small-button" onClick={() => navigator.clipboard.writeText(ownCode)}>コピー</button></div><form className="member-search" onSubmit={findFriend}><Icon name="users" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="NG-XXXX-XXXX-XXXX" autoFocus /><button type="submit" className="small-button" disabled={busyId === 'search'}>検索</button></form>{result && <div className="friend-result"><Avatar name={result.displayName} photoURL={result.photoURL} /><div><strong>{result.displayName}</strong><small>{result.friendCode}</small></div>{requestState === 'blocked' ? <span className="status-badge status-badge--suspended">ブロック中</span> : requestState === 'friend' ? <span className="status-badge status-badge--active">友達</span> : requestState === 'outgoing' ? <span className="status-badge status-badge--pending">申請中</span> : requestState === 'incoming' && incomingRequest ? <button className="small-button small-button--primary" onClick={() => respondToRequest(incomingRequest, true)}>承認</button> : <button className="small-button small-button--primary" onClick={() => sendRequest(result)} disabled={Boolean(busyId)}>友達申請</button>}</div>}<p className="friend-help">相手のNagi IDを正確に入力してください。名前から利用者を一覧検索することはできません。</p></div>}
    {tab === 'blocked' && <div className="request-list">{blocks.map((block) => <article key={block.id}><Avatar name={block.blockedProfile.displayName} photoURL={block.blockedProfile.photoURL} /><div><strong>{block.blockedProfile.displayName}</strong><small>ブロック中</small></div><button className="small-button" onClick={() => unblock(block)} disabled={Boolean(busyId)}>解除</button></article>)}{!blocks.length && <div className="friend-empty"><Icon name="shield" /><strong>ブロック中のユーザーはいません</strong><p>ブロックした相手をここから解除できます。</p></div>}</div>}
    {feedback && <p className="dialog-feedback" role="status">{feedback}</p>}
  </Modal>
}

function NewRoomDialog({ user, onClose, onCreated }: { user: User; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!db || !name.trim()) return
    setBusy(true)
    try {
      const room = await addDoc(collection(db, 'rooms'), { name: name.trim(), description: description.trim(), type: 'public', isArchived: false, createdBy: user.uid, createdAt: serverTimestamp() })
      onCreated(room.id)
    } finally { setBusy(false) }
  }
  return <Modal title="チャンネルを作成" onClose={onClose}><form className="modal-form" onSubmit={submit}><label>チャンネル名<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder="例：雑談" /></label><label>説明（任意）<input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={100} placeholder="どんな場所かをひとこと" /></label><button className="button button--primary button--full" disabled={busy}>作成する</button></form></Modal>
}

function AdminPanel({ user, profile, demo = false }: { user: Pick<User, 'uid'>; profile: UserProfile; demo?: boolean }) {
  const [users, setUsers] = useState<UserProfile[]>(demo ? demoUsers : [])
  const [rooms, setRooms] = useState<Room[]>(demo ? demoRooms : [])
  const [reports, setReports] = useState<MessageReport[]>(demo ? demoReports : [])
  const [tab, setTab] = useState<'overview' | 'users' | 'reports'>('overview')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (demo) return
    if (!db || profile.role !== 'admin') return
    const stopUsers = onSnapshot(collection(db, 'users'), (snapshot) => setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as UserProfile))))
    const stopRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => setRooms(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Room))))
    const stopReports = onSnapshot(query(collection(db, 'reports'), where('status', '==', 'pending')), (snapshot) => setReports(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as MessageReport))))
    return () => { stopUsers(); stopRooms(); stopReports() }
  }, [demo, profile.role])

  if (profile.role !== 'admin') return <main className="center-screen"><div className="status-card"><Icon name="shield" /><h1>管理者専用です</h1><p>このページを表示する権限がありません。</p><a className="button button--primary" href="#/">チャットへ戻る</a></div></main>

  const setUserStatus = async (target: UserProfile, status: UserStatus) => {
    if (target.id === user.uid) return
    if (demo) { setUsers((current) => current.map((item) => item.id === target.id ? { ...item, status } : item)); setNotice(status === 'active' ? 'プレビュー：利用を再開しました。' : 'プレビュー：アカウントを停止しました。'); return }
    if (!db) return
    await updateDoc(doc(db, 'users', target.id), { status })
    setNotice(status === 'active' ? '利用を再開しました。' : 'アカウントを停止しました。')
  }
  const setUserRole = async (target: UserProfile, role: UserRole) => {
    if (target.id === user.uid) return
    if (demo) { setUsers((current) => current.map((item) => item.id === target.id ? { ...item, role } : item)); setNotice('プレビュー：権限を更新しました。'); return }
    if (!db) return
    await updateDoc(doc(db, 'users', target.id), { role })
    setNotice('権限を更新しました。')
  }
  const resolveReport = async (report: MessageReport, hide: boolean) => {
    if (demo) { setReports((current) => current.filter((item) => item.id !== report.id)); setNotice(hide ? 'プレビュー：メッセージを非表示にしました。' : 'プレビュー：報告を却下しました。'); return }
    if (!db) return
    if (hide) await updateDoc(doc(db, report.targetType === 'conversation' ? 'conversations' : 'rooms', report.targetId, 'messages', report.messageId), { isHidden: true })
    await updateDoc(doc(db, 'reports', report.id), { status: hide ? 'resolved' : 'dismissed', resolvedAt: serverTimestamp(), resolvedBy: user.uid })
    setNotice(hide ? 'メッセージを非表示にしました。' : '報告を却下しました。')
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar"><Brand compact /><div className="admin-title"><Icon name="shield" /><span>管理ページ</span></div><nav><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><Icon name="message" />概要</button><button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Icon name="users" />ユーザー</button><button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}><Icon name="flag" />報告<span className="nav-count">{reports.length}</span></button></nav><a href={demo ? '?preview=chat#/' : '#/'}><Icon name="back" />チャットへ戻る</a></aside>
      <main className="admin-main"><header><div><span className="eyebrow">ADMIN CONSOLE</span><h1>{tab === 'overview' ? '概要' : tab === 'users' ? 'ユーザー管理' : '報告された内容'}</h1></div><Avatar name={profile.displayName} photoURL={profile.photoURL} /></header>
        {tab === 'overview' && <><section className="stat-grid"><Stat label="登録ユーザー" value={users.length} icon="users" /><Stat label="公開チャンネル" value={rooms.filter((room) => !room.isArchived).length} icon="hash" /><Stat label="未対応の報告" value={reports.length} icon="flag" /></section><section className="admin-card"><div className="card-heading"><div><h2>対応が必要な項目</h2><p>未処理の報告を新しい順に表示します。</p></div></div>{reports.length ? <div className="compact-list">{reports.slice(0, 5).map((report) => <button key={report.id} onClick={() => setTab('reports')}><span className="list-icon"><Icon name="flag" /></span><span><strong>{report.messagePreview}</strong><small>{formatDateTime(report.createdAt)}</small></span><Icon name="back" className="rotate-180" /></button>)}</div> : <EmptyState text="現在、対応待ちの報告はありません。" />}</section></>}
        {tab === 'users' && <section className="admin-card table-card"><div className="card-heading"><div><h2>ユーザー</h2><p>利用状態と管理権限を変更できます。</p></div><span className="pill">{users.length} users</span></div><div className="user-table"><div className="table-row table-head"><span>ユーザー</span><span>権限</span><span>状態</span><span>操作</span></div>{users.map((target) => <div className="table-row" key={target.id}><span className="table-user"><Avatar name={target.displayName} photoURL={target.photoURL} size="sm" /><span><strong>{target.displayName}</strong><small>{target.email}</small></span></span><span><select aria-label={`${target.displayName}の権限`} value={target.role} disabled={target.id === user.uid} onChange={(e) => setUserRole(target, e.target.value as UserRole)}><option value="member">メンバー</option><option value="admin">管理者</option></select></span><span><span className={`status-badge status-badge--${target.status}`}>{target.status === 'active' ? '利用中' : '停止中'}</span></span><span><button className="small-button" disabled={target.id === user.uid} onClick={() => setUserStatus(target, target.status === 'active' ? 'suspended' : 'active')}>{target.status === 'active' ? '停止' : '再開'}</button></span></div>)}</div></section>}
        {tab === 'reports' && <section className="admin-card"><div className="card-heading"><div><h2>未対応の報告</h2><p>内容を確認し、非表示または却下できます。</p></div></div>{reports.length ? <div className="report-list">{reports.map((report) => <article key={report.id}><div className="report-top"><span className="status-badge status-badge--pending">未対応</span><time>{formatDateTime(report.createdAt)}</time></div><blockquote>{report.messagePreview}</blockquote><p>理由：{report.reason}</p><div><button className="button button--danger" onClick={() => resolveReport(report, true)}>非表示にする</button><button className="button button--ghost" onClick={() => resolveReport(report, false)}>問題なし</button></div></article>)}</div> : <EmptyState text="すべての報告に対応済みです。" />}</section>}
      </main>
      {notice && <div className="toast" role="status"><Icon name="check" />{notice}<button onClick={() => setNotice('')} aria-label="閉じる"><Icon name="close" /></button></div>}
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: number; icon: 'users' | 'hash' | 'flag' }) {
  return <div className="stat-card"><span className="stat-icon"><Icon name={icon} /></span><div><strong>{value}</strong><span>{label}</span></div></div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><span><Icon name="check" /></span><p>{text}</p></div>
}
