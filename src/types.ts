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

export interface PublicProfile {
  id: string
  displayName: string
  photoURL: string | null
  friendCode: string
  updatedAt?: Timestamp
}

export interface FriendRequest {
  id: string
  fromUid: string
  toUid: string
  fromProfile: Pick<PublicProfile, 'displayName' | 'photoURL' | 'friendCode'>
  toProfile: Pick<PublicProfile, 'displayName' | 'photoURL' | 'friendCode'>
  status: 'pending' | 'accepted' | 'declined'
  createdAt?: Timestamp
  respondedAt?: Timestamp
}

export interface Friendship {
  id: string
  memberIds: string[]
  memberProfiles: Record<string, Pick<PublicProfile, 'displayName' | 'photoURL' | 'friendCode'>>
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface BlockRecord {
  id: string
  blockerUid: string
  blockedUid: string
  friendshipId: string
  blockedProfile: Pick<PublicProfile, 'displayName' | 'photoURL' | 'friendCode'>
  createdAt?: Timestamp
}

export interface DirectConversation {
  id: string
  participantIds: string[]
  participantProfiles: Record<string, { displayName: string; photoURL: string | null }>
  lastMessage: string
  lastSenderId: string
  unreadCounts: Record<string, number>
  readAt: Record<string, Timestamp>
  lastMessageAt?: Timestamp
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderName: string
  senderPhotoURL: string | null
  isHidden: boolean
  replyTo?: { messageId: string; senderName: string; text: string }
  reactions?: Record<string, '👍' | '❤️' | '😂'>
  createdAt?: Timestamp
  editedAt?: Timestamp
}

export interface MessageReport {
  id: string
  targetType: 'room' | 'conversation'
  targetId: string
  messageId: string
  messagePreview: string
  reportedBy: string
  reason: string
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt?: Timestamp
  resolvedAt?: Timestamp
  resolvedBy?: string
}
