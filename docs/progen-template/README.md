# ProGen 外部設定テンプレート

## 概要

COMIC-Bridge の ProGen 機能で使う以下のデータを、アプリを再ビルドせずに共有ドライブから更新する仕組みです。

- **NGワードリスト** (伏字対象の26語)
- **数字ルールのサブオプション** (人数/戸数/月の選択肢)
- **カテゴリ定義** (basic/recommended/auxiliary/... の表示名)

アプリ起動時に自動で最新版を取得し、ローカルキャッシュ (`%APPDATA%\comic-bridge\progen-cache\`) に保存します。共有ドライブが到達不能でもキャッシュまたは埋め込み既定値で動作します。

## 配置先（共有ドライブ）

以下のパスに `version.json` と `config.json` を配置してください:

```
G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\Comic Bridge_統合版\Pro-Gen\
├── version.json       ← バージョン情報（必須）
└── config.json        ← 設定本体（必須）
```

このフォルダ内のファイルと同じものが、このテンプレート（`docs/progen-template/`）に同梱されています。**初回セットアップ時はテンプレートを共有ドライブにコピーしてください。**

## 更新手順

1. **`config.json` を編集** — NGワード追加、数字ルール変更など
2. **`version.json` の `version` をインクリメント** — `2.0.0` → `2.0.1` など（SemVer推奨）
3. **`version.json` の `lastModified` を更新** — 任意（`YYYY-MM-DDTHH:MM:SS`形式）
4. 保存するだけ — 次回アプリ起動時に自動反映

## version.json の形式

```json
{
  "version": "2.0.0",
  "lastModified": "2026-04-21T12:00:00",
  "note": "初版",
  "files": ["config.json"]
}
```

- **`version`** (必須): セマンティックバージョン。ローカルキャッシュと比較され、新しい場合のみ更新が走る。
- **`lastModified`** (任意): 編集日時メモ。参照のみ。
- **`note`** (任意): 変更内容メモ。参照のみ。
- **`files`** (任意): 同期対象ファイル配列。省略時は `["config.json"]` のみ同期。

## config.json の形式

```json
{
  "ngWordList": [
    { "original": "ヴァギナ", "replacement": "ヴァ〇ナ" },
    ...
  ],
  "numberSubRules": {
    "personCount": {
      "name": "人数",
      "options": ["ひとり、ふたり、３人", "ひとり、ふたり、三人", ...]
    },
    "thingCount": { "name": "戸数", "options": [...] },
    "month": { "name": "月", "options": [...] }
  },
  "categories": {
    "basic": { "name": "基本的に表記変更されるもの" },
    "recommended": { "name": "表記が推奨されるもの" },
    "auxiliary": { "name": "補助動詞は基本ひらきます" },
    "difficult": { "name": "難読文字は基本ひらきます" },
    "number": { "name": "数字" },
    "pronoun": { "name": "人称" },
    "character": { "name": "人物名（ルビ用）" }
  }
}
```

### 各フィールド

#### `ngWordList`
伏字対象のNGワード一覧。`original` が原文、`replacement` が伏字版。
抽出プロンプトで「これらの単語を伏字化せよ」の指示文に埋め込まれます。

#### `numberSubRules`
数字ルールのサブオプション（ラジオボタン等で選択される候補）。
配列の**インデックス順**が重要 — 既存の JSON 保存済みラベルとの互換性のため、項目の順序を変えないでください。追加は末尾に。

#### `categories`
校正ルールのカテゴリキーと表示名。
キー（`basic`/`recommended` など）は **コード側に既知のものとして参照されているため、キー名の変更・削除は避けてください**。表示名（`name`）のみ自由に編集可能。

## 動作の確認

アプリを起動後、`%APPDATA%\comic-bridge\progen-cache\` を開くと、
共有ドライブからコピーされた `version.json` + `config.json` が確認できます。
このローカルキャッシュと共有ドライブのバージョンが一致していれば正常。

## トラブルシューティング

- **共有ドライブに接続できないPC**: `%APPDATA%\comic-bridge\progen-cache\` にキャッシュがあればそれを使用。無ければビルド時埋め込みの既定値にフォールバック。どちらにしても動作はする。
- **JSON構文エラー**: `config.json` が壊れていても、フィールド単位で**自動的に埋め込み既定値にフォールバック**するため致命的にはならない。ただし JSON.parse 失敗時はファイル全体で既定値が使われる。
- **強制再同期**: アプリ起動時に version.json のバージョンが変わっていれば自動更新。手動トリガーが必要な場合は ProGen 画面内の「設定同期」ボタン（将来追加予定）から。
