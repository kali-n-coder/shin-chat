# Nagi Chat

会話を主役にした、広告のないシンプルなリアルタイムチャットです。フロントエンドは GitHub Pages、認証とデータは Firebase の無料枠（Spark プラン）で運用する構成です。

## 主な機能

- Google / メールアドレス認証
- 1対1の個別チャット（メイン機能）
- 公開チャンネルとリアルタイムメッセージ
- 50件単位で遡れるメッセージ履歴
- メッセージ報告
- 表示名プロフィール
- 管理ページ（ユーザー停止・権限変更・報告処理）
- PC / スマートフォン対応
- Firestore Security Rules によるサーバー側権限制御

## ローカル起動

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

`.env.local` に Firebase Web App の設定を入れてください。Firebase の Web API key は公開クライアント識別子であり、権限は `firestore.rules` で制御しています。サービスアカウント鍵などの秘密情報は置かないでください。

## Firebase 初期設定

```powershell
firebase projects:create shin-chat-20260831 --display-name "Shin Chat"
firebase use shin-chat-20260831
firebase apps:create WEB "Nagi Web"
firebase apps:list WEB
firebase apps:sdkconfig WEB <APP_ID>
firebase firestore:databases:create "(default)" --location asia-northeast1 --edition standard
firebase deploy --only firestore
```

`firebase init auth` と `firebase deploy --only auth` で「メール/パスワード」と「Google」を有効にします。公開先の `kali-n-coder.github.io` はAuthenticationの承認済みドメインへ追加します。

最初の管理者はFirebase Authのカスタムクレーム `admin: true` で安全に指定します。メールアドレスをソースコードやGitHub変数へ保存しません。最初の管理者がログインしたあとは、管理ページから別ユーザーへ管理権限を付与できます。

## GitHub Pages

リポジトリの Settings → Pages → Source を `GitHub Actions` にします。以下の Repository Variables を登録すると、`main` への push で自動公開されます。

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## 無料枠向けの設計

- Firebase Hosting は使わず、静的配信は GitHub Pages に分離
- Cloud Functions、Cloud Storage、課金必須機能は不使用
- 各会話の直近50件だけをリアルタイム購読し、過去分は必要なときだけ50件ずつ取得
- 画像アップロードを行わず、Googleプロフィール画像のURLだけを利用
- Firestore の標準エディションと単一リージョンを使用

利用が増えた場合は Firebase Console の Usage で Authentication と Firestore の使用量を定期的に確認してください。

## 品質確認

```powershell
npm run test
npm run build
```
