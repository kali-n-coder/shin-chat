import type { Timestamp } from 'firebase/firestore'

export function formatMessageTime(value?: Timestamp): string {
  if (!value) return '送信中…'
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(value.toDate())
}

export function formatDateTime(value?: Timestamp): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(value.toDate())
}

export function initials(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join('').toUpperCase() || 'N'
}

export function friendlyAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'このメールアドレスはすでに登録されています。',
    'auth/invalid-credential': 'メールアドレスまたはパスワードが違います。',
    'auth/invalid-email': 'メールアドレスの形式を確認してください。',
    'auth/missing-password': 'パスワードを入力してください。',
    'auth/weak-password': 'パスワードは6文字以上にしてください。',
    'auth/popup-closed-by-user': 'ログイン画面が閉じられました。',
    'auth/popup-blocked': 'ポップアップがブロックされました。ブラウザの設定を確認してください。',
    'auth/operation-not-allowed': 'このログイン方法はまだ有効になっていません。',
    'permission-denied': 'この操作を行う権限がありません。',
  }
  return messages[code] ?? '処理に失敗しました。少し待ってからもう一度お試しください。'
}
