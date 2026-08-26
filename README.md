# Black Board

オンラインでテキストと画像をリアルタイムにやりとりできるチャットアプリです。

## 機能

- リアルタイムテキストチャット（WebSocket）
- 画像の送信（JPG, PNG, GIF, WebP / 最大 5MB）
- オンライン人数の表示
- 参加・退出の通知
- Electron デスクトップアプリ対応（ホスト・接続の両方）

## 起動方法

### ホスト（サーバーを立てる人）

`起動.bat` をダブルクリック、または:

```bash
npm run electron
```

メニュー「Black Board → 接続 URL を表示」で、参加者に渡す URL を確認できます。

### スレーブ（参加者）

`接続.bat` をダブルクリック、または:

```bash
npm run electron:client
```

1. ホストから教えてもらった URL を入力（例: `http://192.168.1.10:3000`）
2. 「接続する」をクリック
3. ユーザー名を入力して参加

ブラウザから接続する場合も、同じ URL を開くだけで OK です。

### ブラウザ版（ホストのみ）

```bash
npm start
```

## インストーラを作る（Windows）

`ビルド.bat` をダブルクリック、または:

```bash
npm run build:win
```

| ファイル | 用途 |
|---------|------|
| `dist/Black Board-Setup-1.0.0.exe` | ホスト用インストーラ |
| `dist/Black Board Connect-Setup-1.0.0.exe` | 接続用（スレーブ）インストーラ |

## リリース

[GitHub Releases](https://github.com/honi0907/black-board/releases) から最新版のインストーラをダウンロードできます。

### バージョン管理

- バージョンは `package.json` の `version` で管理（[SemVer](https://semver.org/)）
- 変更履歴は [CHANGELOG.md](CHANGELOG.md)
- `v*` タグを push すると GitHub Actions がインストーラをビルドして Release を作成

```bash
# 例: v1.0.1 をリリース
npm version patch
git push origin main --tags
```

Setup.exe を実行するとインストールウィザードが開き、インストール先の選択・デスクトップショートカット作成ができます。  
アンインストールは Windows の「アプリと機能」から行えます。

## 技術スタック

- Node.js + Express
- Socket.io（リアルタイム通信）
- Multer（画像アップロード）
- Electron（デスクトップアプリ）
