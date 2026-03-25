# Tauriアプリ統合手順書 — KENBAN → COMIC-Bridge タブ移植

別のTauriアプリ（React+Rust）を、既存のTauriアプリの新規タブとして丸ごと移植する際の手順と注意点をまとめたもの。

---

## 前提

- **ベースアプリ（COMIC-Bridge）**: Tauri 2 + React 18 + TypeScript + Tailwind CSS 3 + Zustand + Vite
- **移植元アプリ（KENBAN）**: Tauri 2 + React 19 + TypeScript + Tailwind CSS 4 + Vite
- ベースアプリはタブベースのナビゲーション（ViewRouter + viewStore）を持つ
- 移植元アプリは単独で動作する全画面アプリ（App.tsx に全状態管理）

---

## 手順

### 1. ベースアプリをコピー

```
ベースアプリのリポジトリをクローン → 作業フォルダにコピー
```

### 2. 移植元のフロントエンドファイルをコピー

移植元の構造をベースアプリ内に分離配置する：

| 移植元パス | コピー先 |
|-----------|---------|
| `src/App.tsx` | `src/components/kenban/KenbanApp.tsx` |
| `src/components/*.tsx` | `src/components/kenban/` （ファイル名にプレフィックス付与で衝突回避） |
| `src/utils/*.ts` | `src/kenban-utils/` |
| `src/hooks/*.ts` | `src/kenban-hooks/` |
| `src/workers/*.ts` | `src/kenban-workers/` |
| `src/types.ts` | `src/kenban-utils/kenbanTypes.ts` |
| `src/assets/*` | `src/kenban-assets/` |
| `src/index.css`, `src/App.css` | `src/kenban-utils/kenban.css`, `kenbanApp.css` |
| `public/pdfjs-wasm/` | `public/pdfjs-wasm/` |

### 3. import パスを全修正

コピーしたファイル内のimportパスを新しいディレクトリ構造に合わせてsedで一括置換：

```bash
# 例: KenbanApp.tsx 内
sed -i "s|from './utils/pdf'|from '../../kenban-utils/pdf'|g" KenbanApp.tsx
sed -i "s|from './components/Header'|from './KenbanHeader'|g" KenbanApp.tsx
sed -i "s|from './types'|from '../../kenban-utils/kenbanTypes'|g" KenbanApp.tsx
# ... 他のファイルも同様
```

**見落としやすいポイント:**
- `import('./types')` 形式のインライン型import（sedの通常パターンでは引っかからない）
- `new URL('../workers/...', import.meta.url)` 形式のWeb Worker URL（Viteビルド時に解決される）
- アセットimport（`import logo from '../assets/logo.png'`）

### 4. ビュー・タブの作成

#### 4-1. viewStore.ts に新しいタブIDを追加

```typescript
export type AppView =
  | "specCheck" | "layers" | ...
  | "kenban";  // 追加
```

#### 4-2. KenbanView.tsx（ラッパーコンポーネント）を作成

```tsx
import KenbanApp from "../kenban/KenbanApp";
import "../../kenban-utils/kenban.css";
import "../../kenban-utils/kenbanApp.css";

export function KenbanView() {
  return (
    <div className="flex h-full w-full overflow-hidden kenban-scope"
         style={{ position: 'absolute', inset: 0 }}>
      <KenbanApp />
    </div>
  );
}
```

#### 4-3. ViewRouter.tsx で状態保持型のルーティング

**重要**: 通常の条件付きレンダリング（`{active === "kenban" && <KenbanView />}`）ではタブ切替時にアンマウント→再マウントされ、全状態が失われる。

```tsx
import { useState, useEffect } from "react";

const [kenbanMounted, setKenbanMounted] = useState(false);

useEffect(() => {
  if (activeView === "kenban") setKenbanMounted(true);
}, [activeView]);

return (
  <div className="flex-1 overflow-hidden relative">
    {/* 他のタブは通常の条件付きレンダリング */}
    {activeView === "specCheck" && <SpecCheckView />}

    {/* KenbanViewはdisplay切替で状態保持 */}
    {kenbanMounted && (
      <div style={{ display: activeView === "kenban" ? "contents" : "none" }}>
        <KenbanView />
      </div>
    )}
  </div>
);
```

#### 4-4. TopNav.tsx にタブボタンを追加

VIEW_TABS配列に新しいタブエントリを追加。

### 5. 移植元App.tsxの修正

#### 5-1. レイアウト修正

```diff
- <div className="h-screen flex flex-col ...">
+ <div className="h-full w-full flex flex-col ...">
```

`h-screen`はタブ内ではオーバーフローするため`h-full`に変更。

#### 5-2. onCloseRequested を無効化

単独アプリでは`getCurrentWebviewWindow().onCloseRequested()`でウィンドウ閉じ時の未保存確認を行っていたが、タブとして埋め込まれるとウィンドウ全体の×ボタンをブロックしてしまう。削除またはコメントアウト。

```tsx
// 削除 or コメントアウト
// const unlisten = await getCurrentWebviewWindow().onCloseRequested(async (event) => {
//   event.preventDefault();
//   ...
// });
```

#### 5-3. 自動更新チェックの無効化（任意）

移植元のupdater `check()` 呼び出しはベースアプリ側のupdaterと競合する可能性がある。タブとして動作する場合は不要。

### 6. Rustバックエンドの統合

#### 6-1. 移植元の lib.rs → kenban.rs モジュールとして作成

- `pub fn run()` を削除（ベースアプリが独自に持つ）
- `AppState` を `KenbanState` にリネーム（名前衝突回避）
- 構造体名の衝突を回避（例: `CropBounds` → `KenbanCropBounds`）
- 全 `#[tauri::command]` 関数を `pub` にする
- ベースアプリと重複するコマンドは `kenban_` プレフィックスを付ける

**リネームが必要なコマンド例:**
| 元の名前 | リネーム後 | 理由 |
|---------|-----------|------|
| `parse_psd` | `kenban_parse_psd` | ベースに同名コマンドあり |
| `list_files_in_folder` | `kenban_list_files_in_folder` | ベースに類似コマンドあり |
| `render_pdf_page` | `kenban_render_pdf_page` | ベースに同名コマンドあり |
| `open_file_in_photoshop` | `kenban_open_file_in_photoshop` | 引数が異なる |
| `save_screenshot` | `kenban_save_screenshot` | ベースにない独自機能 |

重複しないコマンド（`compute_diff_simple`等）はそのまま使用可能。

#### 6-2. lib.rs にモジュール登録

```rust
pub mod kenban;

// Builder に追加
.manage(kenban::KenbanState { ... })
.invoke_handler(tauri::generate_handler![
    // 既存コマンド...
    kenban::kenban_parse_psd,
    kenban::compute_diff_simple,
    // ...
])
```

#### 6-3. Cargo.toml に依存関係を追加

移植元にあってベースにない依存関係のみ追加。既存の依存関係はfeatureフラグの確認だけ行う。

```toml
# 追加例
base64 = "0.22"
open = "5"
dirs = "5"
natord = "1.0"
```

#### 6-4. pdfium.dll の探索パス統一

移植元が `exe隣のみ検索` だった場合、ベースアプリのパターンに統一する：

```rust
pub fn get_pdfium() -> Result<Pdfium, String> {
    let exe_dir = std::env::current_exe()...;

    // 1. CARGO_MANIFEST_DIR/resources/pdfium/ (dev環境)
    // 2. exe隣の resources/pdfium/ (release)
    // 3. exe隣 (legacy)
    // 4. システムライブラリ (fallback)
}
```

dev環境ではexe隣にdllがないため、`CARGO_MANIFEST_DIR`からの探索が必須。

### 7. フロントエンドのinvokeコマンド名を修正

**最も見落としやすいステップ。** リネームしたRustコマンド名に合わせて、フロントエンドの `invoke('...')` 呼び出しを全て修正する。

```bash
# 検索して見つける
grep -rn "invoke(" src/components/kenban/ | grep "'parse_psd'"
grep -rn "invoke(" src/components/kenban/ | grep "'list_files_in_folder'"
# ...

# 一括置換
sed -i "s|invoke('parse_psd'|invoke('kenban_parse_psd'|g" KenbanApp.tsx
sed -i "s|invoke<string\[\]>('list_files_in_folder'|invoke<string[]>('kenban_list_files_in_folder'|g" KenbanApp.tsx
```

**注意:** `invoke<Type>('command_name'` のようにジェネリクス付きの呼び出しもあるため、sed パターンは複数必要。

### 8. CSS/テーマの統合

#### Tailwind バージョンが異なる場合（v4 → v3）

移植元のTailwind v4 `@theme` ブロックをCSS変数に変換し、`.kenban-scope`でスコープ化：

```css
/* Tailwind v4の@themeブロックを変換 */
.kenban-scope {
  --color-surface-base: #0e0e10;
  --color-text-primary: #ececf0;
  background-color: #0e0e10;
  color: #ececf0;
}
```

標準のTailwindユーティリティクラス（`bg-neutral-900`等）はv3でもそのまま動作する。

#### `@import "tailwindcss"` の削除

Tailwind v4の`@import "tailwindcss"`はv3では不要（globals.cssで`@tailwind`ディレクティブが既にある）。

### 9. package.json 依存関係のマージ

移植元にあってベースにない依存関係のみ追加。**Reactバージョンはベース側に合わせる**（ダウングレード）。

```json
{
  "diff": "^8.0.3",
  "jspdf": "^4.0.0",
  "lucide-react": "^0.562.0",
  "pdf-lib": "^1.17.1",
  "pdfjs-dist": "^5.4.530",
  "utif": "^3.1.0"
}
```

### 10. TypeScript型の互換性対応

React 19 → 18 ダウングレード時の型非互換性：

- `useRef<HTMLDivElement>(null)` の戻り値型が異なる（React 19: `RefObject<HTMLDivElement | null>`, React 18: `MutableRefObject<HTMLDivElement | null>`）
- 解決策: 移植元コンポーネントに `// @ts-nocheck` を追加

その他:
- PNG/SVGアセットの型宣言ファイル（`assets.d.ts`）を作成
- UTIFなどの型宣言ファイル（`utif.d.ts`）をコピー

### 11. Tauri設定の更新

#### tauri.conf.json

- **CSP**: `worker-src blob:`, `script-src 'unsafe-eval' blob:` を追加（pdfjs-dist等のWeb Worker用）
- **フォント**: Google Fontsを使う場合は `style-src`と`font-src`にドメインを追加

#### capabilities/default.json

- 移植元が使うプラグイン権限を確認し、不足分を追加
- **注意**: ベースアプリにインストールされていないプラグインの権限を追加するとビルドエラーになる（例: `opener:default` はプラグインなしでは使えない）

#### index.html

- Google Fontsの`<link>`タグを追加（移植元がWebフォントを使う場合）

### 12. 自動更新（Updater）の設定

#### 署名キーの生成

```bash
cargo tauri signer generate -w .tauri_private_key --ci -p ""
```

- 秘密鍵 → GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY`
- パスワード → GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（空文字列）
- 公開鍵 → `tauri.conf.json` の `plugins.updater.pubkey`

#### tauri.conf.json のエンドポイント

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/{owner}/{repo}/releases/latest/download/latest.json"
    ],
    "pubkey": "<生成された公開鍵>"
  }
}
```

#### GitHub Actions ワークフロー

```yaml
- name: Install frontend dependencies
  run: npm install --legacy-peer-deps  # peer dep衝突回避

- name: Build the app
  uses: tauri-apps/tauri-action@v0.5
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  with:
    tagName: ${{ github.ref_name }}
    updaterJsonPreferNsis: true
    includeUpdaterJson: true
```

**pdfium.dllのダウンロードステップも必要**（CIにはdllが含まれないため）：

```yaml
- name: Download PDFium
  shell: pwsh
  run: |
    New-Item -ItemType Directory -Force -Path src-tauri/resources/pdfium | Out-Null
    Invoke-WebRequest -Uri "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-win-x64.tgz" -OutFile pdfium.tgz
    tar -xzf pdfium.tgz
    $dll = Get-ChildItem -Recurse -Filter "pdfium.dll" | Select-Object -First 1
    Copy-Item $dll.FullName src-tauri/resources/pdfium/pdfium.dll
```

#### リリース手順

```bash
# バージョン更新（3箇所同期必須）
# 1. package.json: "version": "x.y.z"
# 2. src-tauri/tauri.conf.json: "version": "x.y.z"
# 3. src-tauri/Cargo.toml: version = "x.y.z"

git add -A && git commit -m "v1.x.x: リリース内容"
git tag v1.x.x
git push && git push --tags
```

### 13. .gitignore の作成

```
node_modules/
dist/
src-tauri/target/
src-tauri/gen/
src-tauri/resources/pdfium/pdfium.dll
*.log
.DS_Store
src-tauri/Cargo.lock
```

**注意**: `package-lock.json`はCI環境での再現性のためにコミットする。

---

## よくある問題と対処法

### ビルドは通るがアプリが起動しない
- `pdfium.dll` が配置されているか確認（`src-tauri/resources/pdfium/`）
- capabilities に未インストールプラグインの権限がないか確認

### タブ切替で状態が消える
- ViewRouterで条件付きレンダリング（`&&`）ではなく`display: none/contents`切替にする
- 一度マウントしたらアンマウントしない（`kenbanMounted` state）

### ×ボタン（ウィンドウクローズ）が効かない
- 移植元の`onCloseRequested` + `event.preventDefault()`がウィンドウ全体のクローズをブロックしている。無効化する。

### invokeコマンドが見つからない
- Rust側でリネームしたコマンド名とフロントエンドの`invoke()`呼び出し名が一致しているか全件確認
- `invoke<Type>('name'` のようなジェネリクス付きパターンも見落とさない
- ユーティリティファイル（`pdf.ts`等）内のinvokeも忘れがち

### PDF が表示されない
- Rust側のpdfium.dll探索パスがdev環境（`CARGO_MANIFEST_DIR`）を含んでいるか確認
- CSPに`worker-src blob:`, `script-src blob:`があるか確認

### React 18/19 型エラー
- `useRef` の戻り値型が異なるため、移植元ファイルに `// @ts-nocheck` を追加
- ビルドコマンドが`tsc && vite build`の場合、tscが通らなければビルド失敗するため必須

### Web Worker パスエラー
- `new URL('../workers/file.ts', import.meta.url)` のパスをコピー先に合わせて修正
- Viteビルド時に解決されるため、tscは通ってもビルドで失敗する

### CI で npm install が失敗する（ERESOLVE）
- `npm install --legacy-peer-deps` を使用
- または `package-lock.json` をコミットに含める
- React 18/19 混在によるpeer dependency衝突が主な原因

### CI で署名エラー（failed to decode secret key）
- `cargo tauri signer generate --ci -p ""` で正しい形式のキーを生成
- GitHub Secretsの値にスペースや改行が混入していないか確認
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` は空文字列でも設定が必要

---

## チェックリスト

### フロントエンド
- [ ] フロントエンドファイルのコピーとimportパス修正
- [ ] KenbanView ラッパーコンポーネント作成
- [ ] viewStore にタブID追加
- [ ] ViewRouter に状態保持型ルーティング追加
- [ ] TopNav にタブボタン追加
- [ ] KenbanApp.tsx の `h-screen` → `h-full` 修正
- [ ] `onCloseRequested` の無効化
- [ ] CSS スコープ化（`.kenban-scope`）
- [ ] package.json 依存関係マージ（Reactバージョンは変えない）
- [ ] TypeScript型対応（`@ts-nocheck`、型宣言ファイル）

### バックエンド
- [ ] Rust kenban.rs モジュール作成（コマンドリネーム含む）
- [ ] lib.rs にモジュール登録・state管理・コマンド登録
- [ ] Cargo.toml 依存関係マージ
- [ ] pdfium.dll 探索パス統一

### 結合
- [ ] フロントエンドのinvokeコマンド名を全件修正（最重要）
- [ ] tauri.conf.json CSP更新
- [ ] capabilities 権限確認
- [ ] index.html フォント追加

### リリース
- [ ] 署名キー生成（`cargo tauri signer generate --ci -p ""`）
- [ ] GitHub Secrets設定（TAURI_SIGNING_PRIVATE_KEY, PASSWORD）
- [ ] tauri.conf.json にpubkeyとエンドポイント設定
- [ ] GitHub Actionsワークフロー作成
- [ ] .gitignore 作成
- [ ] `npm run tauri dev` で起動確認
- [ ] `npm run tauri build` でローカルビルド確認
- [ ] タグ付きpushでCIリリース確認
