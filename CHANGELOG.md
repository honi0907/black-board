# Changelog

All notable changes to Black Board are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2026-08-28

### Added

- PDF をボード上でアプリ内プレビュー（拡大・横縦リサイズ）
- Office ファイル（Word / Excel / PowerPoint）を PDF に変換してプレビュー
- ホスト用インストーラーに LibreOffice を同梱（追加インストール不要）

### Fixed

- 画像・PDF 添付が表示されない問題（`cacheFileBlob` 未定義）
- Black Board Connect が起動できない問題（`icon-path.js` 未同梱）
- PDF プレビューの枠表示と縦方向リサイズ

## [1.2.2] - 2026-08-27

### Fixed

- 自動更新で「はい」を押してもインストーラーが起動しない問題
- 更新ダウンロード中に進捗が表示されない問題

## [1.2.1] - 2026-08-27

### Fixed

- アプリ本体（EXE・タスクバー）のアイコンが Electron のままになる問題
- 自動更新ポップアップが表示されない問題（`latest.yml` を Release に同梱）

## [1.2.0] - 2026-08-27

### Added

- カスタムアプリアイコン（黒板＋付箋デザイン）
- PDF / Office / テキスト / ZIP などのファイル添付
- ファイルカード表示（開く・PCへドラッグ保存）

## [1.1.0] - 2026-08-27

### Added

- ペン描画（3色・3サイズ・一筆消し）
- 付箋の編集・色変更・コピー・ポストイット風デザイン
- 複数ボード（タブ切替・名前変更）
- ボードの永続保存・自動保存（一時保存）
- JSON 書き出し
- GitHub からの自動更新（起動時・はい/いいえ・インストール後自動再起動）
- 画面右下にバージョン表示
- 参加時のユーザー別付箋色自動割り当て
- ポート競合時のフォールバック（3000–3009）

### Fixed

- 参加ボタンが動かない問題（draw.js / app.js の変数衝突）
- 接続エラー時にログイン画面へ戻る問題
- ポート 3000 占有時の起動失敗

## [1.0.0] - 2026-08-26

### Added

- リアルタイムテキスト・画像チャット（Socket.io）
- ホスト用 Electron アプリ（サーバー内蔵）
- 接続用 Electron アプリ（スレーブ向け）
- Windows NSIS インストーラ（ホスト / 接続の 2 種）
- 接続 URL 表示・接続先変更機能
- `起動.bat` / `接続.bat` / `ビルド.bat`

[1.2.1]: https://github.com/honi0907/black-board/releases/tag/v1.2.1
[1.2.0]: https://github.com/honi0907/black-board/releases/tag/v1.2.0
[1.1.0]: https://github.com/honi0907/black-board/releases/tag/v1.1.0
[1.0.0]: https://github.com/honi0907/black-board/releases/tag/v1.0.0
