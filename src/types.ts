import type { Timestamp } from 'firebase/firestore'

export type UserRole = 'member' | 'admin'
export type UserStatus = 'active' | 'suspended'

export interface UserProfile {
  id: string
  displayName: string
  email: string
  photoURL: string | null
  role: UserRole
  status: UserStatus
  createdAt?: Timestamp
  lastSeenAt?: Timestamp
}

export interface Room {
  id: string
  name: string
  description: string
  type: 'public' | 'private'
  memberIds?: string[]
  isArchived: boolean
  createdBy: string
  createdAt?: Timestamp
}

export interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderName: string
  senderPhotoURL: string | null
  isHidden: boolean
  createdAt?: Timestamp
  editedAt?: Timestamp
}

export interface MessageReport {
  id: string
  roomId: string
  messageId: string
  messagePreview: string
  reportedBy: string
  reason: string
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt?: Timestamp
  resolvedAt?: Timestamp
  resolvedBy?: string
}
