# COMIC-Bridge (manga-psd-manager)

漫画入稿データ（PSD）の確認・調整を行うデスクトップアプリケーション

## ⚠️ 重要な注意事項

**このプロジェクトフォルダ（`C:\Users\yamamoto-ryusei\Documents\6_スクリプト\アプリデータ\COMIC-Bridge_統合版\`）以外のファイルやフォルダを閲覧・参照しないこと。**
外部のファイルパスへのアクセスは、ユーザーが明示的に指定した場合（デバッグ用PSDファイルの読み取り等）に限る。

## 概要

漫画制作者や編集者が入稿前にPSDファイルの仕様をチェックし、必要に応じてPhotoshopと連携して一括修正できるツール。統合ビューアー（テキスト照合・写植確認・校正JSON・DTPビューアー）、検版ツール（差分モード・分割ビューアー、v3.9.0で独立化）、ProGen（テキスト抽出・校正プロンプト生成ツール）を内蔵。全機能React/Tailwind/Zustandネイティブ実装。

## 技術スタック

- **フレームワーク**: Tauri 2.0
- **フロントエンド**: React 18 + TypeScript + Vite
- **スタイリング**: Tailwind CSS
- **状態管理**: Zustand
- **PSD処理**: ag-psd（読み取り専用）、Photoshop ExtendScript（変換・書き込み）
- **PDF処理**: pdfium-render（プレビュー/サムネイル）、Photoshop PDFOpenOptions（分割処理）
- **バックエンド**: Rust
- **統合ビューアー**: pdfjs-dist, pdf-lib, jspdf, lucide-react（LCS diff等のユーティリティは`kenban-utils/textExtract.ts`で共有）
- **差分ビューアー / 分割ビューアー**: React/Zustandネイティブ（v3.5.0でKENBANから完全移植済み）
- **ProGenタブ**: React（Zustand + Tailwind、本体と統合済み）

## 設計思想

**「検出はアプリ、修正はPhotoshop」**

- PSDメタデータの読み込み・チェックはag-psdで高速に実行
- 実際の画像変換（DPIリサンプリング、カラーモード変換等）はPhotoshop JSXスクリプトで実行
- **ag-psd の writePsd() はPSDバイナリを破壊する** → PSD書き込みは必ずPhotoshop JSX経由
- Photoshopの高品質な画像処理エンジンを活用

## 主要機能

### 1. PSD読み込み・プレビュー
- ドラッグ&ドロップでファイル/フォルダ読み込み（グローバルD&D: AppLayout常時リスナー、全対応形式を受付）
- 自然順ソート: ファイル名の数字部分を数値比較（"1巻 (2)" < "1巻 (10)"）
- 埋め込みサムネイル表示（高速）
- メタデータ抽出（サイズ、DPI、カラーモード、ビット深度、レイヤー構造、αチャンネル等）
- レイヤーツリー表示: 種別アイコン（グループ/テキスト/調整/スマートオブジェクト/シェイプ/レイヤー）
- マスク情報表示: クリッピングマスク(`clip`バッジ)、レイヤーマスク、ベクトルマスク

### 2. 自動仕様チェック
- ファイル読み込み後に仕様選択モーダルを表示
- モノクロ/カラー選択で即座にチェック開始
- 「次回から自動選択」で前回の仕様を記憶
- チェック結果をサムネイルとToolbarに表示（OK/NG件数）
- NGファイルはホバーで理由を表示

**チェック項目:**
- カラーモード（RGB / Grayscale）
- 解像度（350dpi / 600dpi）
- ビット深度（8bit / 16bit）
- αチャンネルの有無

**仕様チェックロジック:**
- 複数の仕様定義（モノクロ原稿、カラー原稿等）
- ファイルがいずれか1つの仕様に完全合格すればOK

### 3. NG時の修正ガイド
- NGファイル選択時にDetailPanelで修正ガイドを表示
- 問題点（現在値 → 必要値）を明示
- Photoshopでの修正方法を説明
- 「この1件を変換」「NGすべて変換」ボタン
- サムネイル複数選択（Ctrl+Click / Shift+Click）で選択中のNGファイルのみ変換可能
- サムネ領域外クリックで複数選択を解除（`data-preview-grid`/`data-sidebar`/`data-detail-panel`属性で判定、サイドバー・詳細パネル内クリックは除外）

### 4. Photoshop連携変換
- NGファイルを一括で仕様に合わせて変換
- 変換処理:
  - DPI変更（BICUBICリサンプリング）
  - カラーモード変換
  - ビット深度変換
  - αチャンネル削除
- 変換完了後にConversionToastで結果通知（成功:チェックマーク / エラー:シェイク）
- 処理完了後にアプリウィンドウを前面に復帰（`window.set_focus()`）
- 変換後に仕様チェックを自動再実行（`usePsdStore.getState().files`で最新状態を取得）

### 5. ガイド線管理
- 高解像度プレビュー: 3層キャッシュ（メモリ→ディスク→フル生成）で高速化
  - 決定論的ファイル名: `{name}_{modified_secs}_{maxSize}.jpg`
  - JPEG品質92（トンボの細線保持）
- Photoshop風Canvas定規（グラデーション、ズーム対応目盛り）
- 定規からドラッグでガイド作成
- ガイドクリックで選択 → ドラッグで移動 → 矢印キーで微調整（+Shift 10px）
- ガイド線は常に1px表示（選択時は色とグローで区別）
- `moveGuide`アクション: ドラッグ中は履歴を積まず、開始時に1回だけpushHistory
- Undo/Redo対応（Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z）
- ズーム/パン操作（Ctrl+/-/0、Space+ドラッグ）
- プリセット（B5同人誌、A4商業誌等）
- 複数ファイルへの一括適用（Photoshop JSX経由、`apply_guides.jsx`）
- 適用完了後に結果サマリー表示（成功/エラー件数）
- 処理完了後にアプリウィンドウを前面に復帰（`window.set_focus()`）

### 6. レイヤー制御（Photoshop JSX経由）
- **サブタブ構成**: 「レイヤー制御」「リネーム」の2タブ。リネームタブはRenameViewをそのまま内蔵
- **5つのアクションモード**: hide（非表示）/ show（復元）/ custom（カスタム）/ organize（フォルダ格納）/ layerMove（レイヤー整理）
- レイヤー表示/非表示の一括切り替え（`hide_layers.jsx`）
- 条件指定: テキストレイヤー、テキストフォルダ、レイヤー名、フォルダ名、カスタム条件
- 部分一致/完全一致、大文字小文字の区別オプション
- 非表示→表示（復元）モード: `doc.info.caption`にメタデータ保存、親グループの可視性も自動復元
- **organizeモード（フォルダ格納）**: 指定名のグループ（デフォルト: "#原稿#"）にレイヤーを再グルーピング（`organize_layers.jsx`）。`organizeTargetName`でグループ名指定、`organizeIncludeSpecial`で特殊レイヤー（白消し・棒消し等）も含めるか選択。`run_photoshop_layer_organize` Rustコマンド経由
- **layerMoveモード（レイヤー整理）**: 条件ベースでレイヤーを指定グループに移動（`move_layers.jsx`）。4条件のAND判定: テキストレイヤー / サブグループ最上位 / サブグループ最下位 / レイヤー名一致（部分一致/完全一致）。検索範囲: ドキュメント全体 or 特定グループ内。移動先グループが存在しない場合は新規作成オプション。`run_photoshop_layer_move` Rustコマンド経由
- **customモード（カスタム操作）**: 右プレビューでレイヤーの目アイコンをクリックして個別に表示/非表示設定、レイヤー移動操作を登録。`custom_operations.jsx`で一括適用。`run_photoshop_custom_operations` Rustコマンド経由。Undo対応（`_customOpsHistory`スタック）
- **非表示テキストレイヤー削除**: hide/customモードで使用可能。非表示のテキストレイヤーをすべて削除（不可逆操作）。hideモードは`hide_layers.jsx`内で処理、customモードは`custom_operations.jsx`内の`deleteHiddenTextLayers()`で処理
- 選択ファイルのみ / 全ファイル処理対応
- **保存先選択**: 上書き保存 or 別フォルダに保存（`Desktop/Script_Output/レイヤー制御/{元フォルダ名}/`）。layerStoreの`saveMode`で管理、Rust側で出力先算出→JSXの`saveFolder`パラメータで`saveAs`先を切替
- **詳細レポートダイアログ**: 処理完了後に中央モーダル（createPortal）でファイル別ツリー表示。親フォルダ∈情報付きでグループ/レイヤーの階層関係を表示（F/G/T/L種別バッジ）
- JSX側: `changedNames`に`"テキスト「name」∈「parent」"`形式で親フォルダ情報を記録。フロント側`extractMatchedItems()`→`buildTree()`でツリー構築
- **ビューアーモード**: LayerPreviewPanel内タブ切替（レイヤー構造/ビューアー）。全ファイルを対象に高解像度プレビュー表示（useHighResPreview maxSize=2000）。矢印キー/マウスホイール/矢印ボタンでページ送り（端でクランプ、循環なし）。P/Fショートカットはキャプチャフェーズでインターセプトしてビューアーの現在ファイルに対応
- **ビューアー高速化**: フロントエンドURLキャッシュ（30エントリ、`urlCache` Map）でキャッシュヒット時は即座に表示。隣接ファイル（±1）の`prefetchPreview()`でプリフェッチ。ロード中は前の画像をopacity-40で維持（ちらつき防止）。サムネイルフォールバック（高解像度未取得時にopacity-60で即表示）。ローディングスピナーは右上に小型表示

### 7. レイヤー差替え（Photoshop JSX経由）
- **テキスト差替え**: 植字データ → 画像データへテキストレイヤー/特定名グループを差替え
- **画像差替え**: 画像データ → 植字データへ背景レイヤー/特定名レイヤー/特定名グループを差替え
- **同時処理（バッチモード）**: 白消し・棒消しフォルダを自動検出して一括差替え
- ペアリング: ファイル順/数字キー/リンク文字（手動・自動検出）。セグメント型ピルボタンで方式切替
- 中央エリアにD&Dドロップゾーン（Tauri物理座標→CSS座標のDPR補正付き）
- **ドロップゾーン中央インジケータ**: 準備完了バッジ + モード連動方向矢印（text=→、image/batch=←）。divベースの円形矢印（Tailwindクラスで描画、SVG inline strokeにはCSS変数が効かないためcurrentColorパターンを使用）
- バッチモード: 親フォルダ⇔個別指定の排他制御、サブフォルダ自動検出
- ファイル数カウント（再帰対応）、0件時の警告表示
- **設定の再配置**: 全般設定セクションを廃止。フォントサイズを丸める→テキストモード内（デフォルトOFF）、サイズ変更を行わない→画像モード内、サブフォルダ対応→フォルダ選択セクション内に配置。バッチモードは両設定を表示
- **ペアリング確認ダイアログ**: 自動ペアリング/手動マッチのタブ切替（ReplacePairingModal）
  - **自動タブ（PairingAutoTab）**: チェックボックス付きペアテーブル、行ごとの鉛筆アイコン（編集）/×ボタン（解除）、ヘッダーに「編集」「解除」明記。未マッチファイル折りたたみセクション（クリックでペア作成）。モード切替時はopacity transitionでスムーズ遷移。マッチキーバッジ（ファイル順=#N、数字キー=pN、リンク文字=キー文字）。マッチ進捗バー（分母は左列=差し替え元ファイル数）
  - **手動タブ（PairingManualTab）**: 2カラムファイルリスト + クリック/ドラッグでペア作成
  - **出力設定（PairingOutputSettings）**: 折りたたみ式。出力フォルダ名入力 + 保存ファイル名トグル + 出力パスプレビュー
- **カスタム出力フォルダ名**: ダイアログ内出力設定で任意のサブフォルダ名を指定可能（空欄ならタイムスタンプで自動生成）
- **詳細マッチレポート**: 処理完了後に結果テーブルの各行にマッチしたレイヤー/グループ名をインラインタグバッジで表示（resultMatchMap）
- **完了トースト通知**: モーダル閉じ後にも成功/エラー結果をReplaceToastで表示、出力フォルダを開くボタン付き
- Photoshop JSX経由で差替え実行（`replace_layers.jsx`）

### 8. 見開き分割（Photoshop JSX経由）
- **均等分割**: 中央で左右に分割（`_R`/`_L`サフィックス）
- **不均等分割**: ノド（綴じ）側に余白を追加して均等化（`outerMargin`設定）
- **分割なし**: フォーマット変換のみ
- 単ページ自動検出: 先頭/末尾ファイルが標準幅の70%未満なら分割スキップ
- ページ番号: `_R/_L` または連番 `_001, _002...`
- **1ファイル目の右側が白紙**: `firstPageBlank`チェックで白紙右ページを破棄し、左ページから`_001`で開始（連番モード時のみ表示）
- **最終ファイルの左側が白紙**: `lastPageBlank`チェックで最終ファイルの左ページを破棄し、右ページで連番を終了（連番モード時のみ表示）
- オプション: 非表示レイヤー削除、はみ出しテキスト除去
- 出力形式: PSD / JPG（品質0-100%、JSX側は0-12スケールに変換）
- **マルチフォーマット対応**: PSD/PSB以外にJPG, PNG, TIFF, PDF, BMP, GIF, EPSも読み込み可（Photoshopが開ける全形式）
- **PDF対応**: PDFドロップ時にページ単位で展開表示。プレビュー/サムネイルは`pdfium-render`でレンダリング。分割処理はPhotoshop `PDFOpenOptions`で600dpiオープン
- **実行ボタン分離**: 「選択のみ (N)」「全て実行 (N)」の2ボタンで対象を明示
- **SplitPreview**: 定規ドラッグで垂直ガイド操作、ズーム/パン、Undo/Redo対応
- **splitStore**: `selectionHistory`/`selectionFuture`でUndo/Redo。`startDragSelection()`でドラッグ中は履歴スパム防止
- Photoshop JSX経由で全ファイル一括処理（`split_psd.jsx`、タイムアウト5分）

### 9. TIFF化（Photoshop JSX経由）
- **TIPPY v2.92の処理パイプライン準拠**: PSD→TIFF一括変換（テキスト整理・カラーモード変換・ぼかし・クロップ・リサイズ・リネーム）
- **処理順序**: unlock → テキストグループ検索 → 上に移動 → 背景SO化 → テキストSO化 → 両方ラスタライズ → カラーモード変換 → テキスト再SO化 → 非表示 → ぼかし(背景のみ) → 表示 → getByName最終マージ → crop → resize → save
- **ExtendScript注意**: レイヤー比較は`.id`（プロキシオブジェクトの`===`は不可）、選択は`putIdentifier`+`makeVisible:false`、crop引数は`UnitValue`配列
- **出力フォルダ重複回避**: `TIF_Output`フォルダが既存の場合`TIF_Output (1)`, `(2)`...で連番生成（Rust側でJSON内outputPathも書き換え）
- **ビジュアルクロップエディタ**: useHighResPreviewベースのプレビュー上にドラッグ可能なクロップ矩形をオーバーレイ。640:909アスペクト比ロック、8ハンドルリサイズ、暗転マスク、三分割グリッド、リアルタイム寸法表示、比率検証（±1%）。手入力フィールド(L/T/R/B)は廃止済み — 比率OK/サイズ表示/PSDから自動設定のみ表示
- **個別クロップ編集**: ファイル別クロップ編集モード中は`savedGlobalBoundsRef`でグローバル範囲を退避。OK/キャンセルボタン押下時にグローバル範囲を復元（個別編集がグローバル設定を上書きしない）
- **個別クロップ優先表示**: TiffViewerPanel（ビューアータブ）・TiffCropEditor（プレビュータブ）ともに、参照ファイルに個別クロップ設定があればグローバル設定より優先して表示。fileOverridesのキーはPsdFileの`.id`（`.fileId`ではない）。TiffCropEditorでは個別範囲をアンバー色ソリッド枠（読み取り専用）でメイン表示し、グローバル範囲をピンク破線＋ハンドルでグローバル編集可能な状態を維持
- **バッチキュー＆個別上書き**: 全ファイルの処理予定を可視化。ファイル毎にカラーモード・ぼかし半径・スキップをインライン上書き。リネームプレビュータブで出力名確認・重複検出
- **カラーモード**: モノクロ/カラー/変更なし/個別選択（ページ範囲ルール最大3件 + デフォルトモード）
- **ガウスぼかし**: モノクロ時のみ適用、半径指定(px)。部分ぼかし（最大5ページ、ページ別半径）
- **部分ぼかしのページマッチング**: `buildSettingsJson`内で`allPsdFiles`（psdStore全ファイル）から`globalFileIndex`を取得し、選択ファイルのみ処理時もグローバルページ番号で`partialBlurEntries`をマッチ。ファイル別ぼかしモーダルは既存overrideがない場合に空リストで開始（グローバル設定にフォールバックしない）
- **クロップ範囲**: 640:909比率。JSONから読込/保存（CLLENN互換: ジャンル→レーベル→タイトル階層）。キャンバスサイズ不一致ダイアログ（4択: ラベル再選択/手動選択/そのまま/スキップ）。PSDガイドから自動設定ボタンはクロップ有効/無効に関わらず常時表示
- **リサイズ**: 1280x1818（DPI: モノクロ=600, カラー=350）
- **テキスト整理**: #text#, text, 写植, セリフ, テキスト, 台詞 グループを検索・統合→スマートオブジェクト化
- **リネーム**: 連番/ページ数計算/リネームなし。開始番号・ゼロ埋め桁数指定
- **出力**: TIFF(LZW)/PSD、中間PSD保存、画像レイヤー統合オプション
- **PSB対応**: PSBファイルのTIFF変換サポート
- Photoshop JSX経由で実行（`tiff_convert.jsx`）
- **設定パネル**: 折りたたみ式セクション構成（処理状態表示スピナー+プログレスバー付き）
  - **出力形式**: TIFF/JPG切替
  - **カラーモード・ぼかし**: カラーモード選択、ガウスぼかし設定、ルール編集
  - **クロップ・リサイズ**: クロップ設定（比率OK/サイズ/PSD自動設定）＋リサイズ・解像度を統合
  - **リネーム・出力先**: リネーム設定＋出力先ディレクトリ＋中間PSD保存＋テキスト整理を統合
  - ※サブフォルダも含めるチェックはTiffFileList（中央ファイルリスト）ヘッダーとTiffBatchQueueヘッダーに配置
- **設定永続化**: localStorageに保存（ただし`crop.bounds`はファイル依存のため永続化しない）
- **JSON範囲ライブラリ**: TiffCropRangeLibrary（読込/保存/新規作成の3タブ）、GENRE_LABELS定数でジャンル→レーベルマッピング
- **Tachimi互換JSON構造**: TiffCropPreset型（units: "px", size, documentSize, savedAt）。新規登録時に現在の選択範囲をプリセットとして保存。4スペースインデント
- **Tachimi互換キーボード操作**: ガイド移動1px/Shift+10px、範囲移動10px/Shift+1px（逆）。矢印キーUndo最適化（連続押し中は1回だけ履歴保存）。Delete/Backspaceでガイド・選択範囲削除
- **ガイド交点クロップ作成**: トンボにガイドを引き、交点からクロップ範囲をドラッグ作成。クロップ範囲がない時はガイドクリックでクロップ開始。クロップ範囲がある時は未選択ガイドをpointer-events:noneにして矩形操作を優先

### 10. リネーム（レイヤーリネーム / ファイルリネーム）
- **サブモード切替**: 「ファイルリネーム」「レイヤーリネーム」のタブ切替
- **モードA: レイヤーリネーム（Photoshop JSX経由）**
  - 最下位/背景レイヤーを指定名に変更
  - レイヤー/グループ名の検索→置換（複数ルール対応、完全一致/部分一致/正規表現）
  - ファイルを連番で別名保存（ベース名+セパレータ+ゼロ埋め）
  - 出力先フォルダ選択
  - ライブプレビュー（psdStoreのlayerTreeデータで変更前→変更後を表示）
  - Photoshop JSX経由で実行（`rename_psd.jsx`）
- **モードB: ファイルリネーム（Rust直接処理、Photoshop不要）**
  - 対応形式: PSD, PSB, TIFF, JPG, PNG, BMP, GIF, PDF, EPS
  - 連番リネーム: ベース名+セパレータ+ゼロ埋め連番。デフォルト: 開始番号=3, 桁数=4, セパレータ=空文字
  - 文字列置換: 検索→置換（部分一致/正規表現）
  - プレフィックス/サフィックス追加
  - フォルダ追加ボタンで複数フォルダ対応（フォルダ名ヘッダー付き表示）
  - ドラッグ並替え: ファイル順序変更→連番割り当てに反映
  - チェックボックスで一部だけリネーム対象に選択
  - ダブルクリックで個別ファイル名編集
  - 出力方式: 「Script_Outputにコピー」 or 「元の場所で上書きリネーム」
  - プレビュー: 変更前→変更後を一覧表示
  - invoke `batch_rename_files` でRust直接fs::copy/fs::rename
- **fileEntries→psdStore自動同期**: ファイルリネームに追加されたPSD/PSBを自動的にpsdStoreへ同期（レイヤーリネーム用のレイヤーツリー取得）
- **RenameResultDialog**: 処理完了ダイアログ（成功/失敗一覧 + 出力フォルダを開くボタン）

### 11. 合成（Compose / Photoshop JSX経由）
- **概要**: 2つのPSDファイル（原稿A / 原稿B）を1つの合成ファイルに統合
- **5つのデフォルト要素**: テキストフォルダ(A)、背景(B)、#背景#(除外)、白消し(除外)、棒消し(除外) — 各要素をどちらのソースから取るか(A/B/除外)選択可能
- **要素ルーティング**: restSourceで指定した側がbaseDoc（保存対象）、もう片方がotherDoc（コピー元）。要素のsourceとbaseLabel(A/B)を**文字列比較**してルーティング（ExtendScriptのDocumentオブジェクト比較は不安定なため）
- **ペアリング**: ファイル順/数字キー/リンク文字（手動・自動検出）の4方式。Replaceと同じペアリングUIを流用
- **出力先**: `Desktop/Script_Output/合成ファイル_出力/{timestamp}/` または差替えタブ内合成は `差替えファイル_出力/{timestamp}/`
- **サブフォルダ対応**: ソースファイルをサブフォルダに整理してから合成可能
- **コンポーネント**: ComposeView, ComposePanel, ComposeDropZone, ComposePairingModal（Auto/Manualタブ）, ComposePairingOutputSettings, ComposeToast
- **ストア**: `composeStore.ts` — folders, composeSettings(elements/restSource/skipResize/roundFontSize), pairingJobs, scannedFileGroups, excludedPairIndices, manualPairs, phase/progress/results管理
- **フック**: `useComposeProcessor.ts` — スキャン＆ペアリング、Photoshop実行
- Photoshop JSX経由で合成実行（`replace_layers.jsx`のcompose設定で処理）。合成ヘルパー: `composeCopyElement()`, `composeRemoveElement()`

### 12. Scan PSD（フォントプリセット管理）
- **元スクリプト**: `je-nsonman_ver2.86.jsx`（約11,000行）からの移植
- **概要**: PSDフォルダをスキャンしてフォント・サイズ・ガイド等のメタデータを収集し、プリセットJSONとして管理
- **モード**: 新規作成（スキャン→保存）/ JSON編集（既存JSONの読み込み・編集）
- **5タブ構成**: 作品情報(WorkInfoTab) / フォント種類(FontTypesTab) / サイズ統計(FontSizesTab) / ガイド線(GuideLinesTab) / ルビ(TextRubyTab)

**FontTypesTab（フォント種類タブ）:**
- **プリセットセット管理**: 複数のプリセットセット（「デフォルト」「手動追加」等）を切替・追加・削除・リネーム
- **カスタムセット作成**: 「+」ボタンでフォントピッカー付きセット作成。既存セット（デフォルト・手動追加等）や未登録フォントから選択してセットを構成
- **手動フォント追加**: フォント検索フォームで部分一致検索（PostScript名・表示名対応）。`search_font_names` Rustコマンドで検索→1件なら自動入力、複数件ならドロップダウンから選択、0件ならエラー表示。追加フォントは「手動追加」セットに登録
- **フィルタ機能**: トグルチップで絞り込み。カテゴリあり/なし（排他）、インストール済み/未インストール（排他）。異なるペア間はAND
- **ソート機能**: ドロップダウンで切替。デフォルト（カテゴリ順+未インストール最下位）/ 名前順 / カテゴリ順 / 出現数順 / インストール順
- **纏め（グループ化）機能**: フォントファミリーを自動検出し、同ファミリーの重複フォントを統合。`extractGroupKey()` で表示名からファミリーキーを抽出（ＤＦＰ→ＤＦ正規化、バージョン識別子除去等）。使用回数最多のフォントを「メイン」として残し、他を除去。プレビュー→確認→実行のUIフロー
- **未登録フォント**: scanData.fontsに存在するがpresetSetsに未登録のフォントを「未登録フォント」セクションに表示。個別追加 / 一括追加ボタン
- **カテゴリ自動判定**: `getAutoSubName()` でPostScript名からセリフ/モノローグ/ナレーション等のカテゴリを自動付与（`FONT_SUB_NAME_MAP` 定義）
- **カテゴリ手入力対応**: インライン編集・手動フォント追加の両フォームで、既存カテゴリの選択に加えて自由入力も可能（`<input>` + `<datalist>` 方式）
- **インストール状態表示**: `useFontResolver` でフォントのインストール有無を色分け表示

**データ分離設計:**
- **プリセットJSON** (`{jsonFolderPath}/{label}/{title}.json`): 選択されたガイドのみ (`guides`)、プリセット、作品情報。`guideSets`/`excludedGuideIndices` は含めない。`rubyList`/`selectionRanges` は含めない（別途テキストログに出力）
- **scandata** (`{saveDataBasePath}/{label}/{title}_scandata.json`): 全ガイドセット、選択・除外状態 (`selectedGuideSetIndex`, `excludedGuideIndices`)、フォント統計等の完全データ。`editedRubyList` は含めない（ルビデータは別途テキストログに出力）
- **テキストログ** (`{textLogFolderPath}/`): ルビリスト等のテキストデータを出力（`performExportTextLog`）
- **JSON読み込み時**: リンクscandataを自動検索 (`{saveDataBasePath}/{label}/{title}_scandata.json`)。見つからない場合はJSON内の `guideSets` からフォールバックscanDataを構築

**ガイド自動選択（元スクリプト準拠）:**
- `isValidTachikiriGuideSet()`: ドキュメント中心±1pxのガイドを除外、上下左右各1本以上で有効判定
- `autoSelectGuideSet()`: 有効タチキリ優先 → 使用回数降順でソート → インデックス0を自動選択

**保存ルール:**
- ファイル名: `{title}.json` / `{title}_scandata.json`
- 保存先: `{basePath}/{label}/`
- レーベル・タイトル未入力時: `{basePath}/_仮保存/temp.json` に仮保存 → 入力後に正式保存＆仮データ削除
- スキャン完了後にフォント自動登録 (`autoRegisterDetectedFonts()`) → 自動保存 (`performPresetJsonSave()`)
- `autoRegisterDetectedFonts()`: `scanData.fonts` から全プリセットセット未登録のフォントを検出し、現在のセットに `getAutoSubName()` でカテゴリ名付きで自動追加（je-nsonman準拠）
- スキャン開始にはレーベル・タイトルの事前入力が必須

**元スクリプトJSON互換（エクスポート）:**
- `convertSizeStatsForExport()`: 内部形式（`mostFrequent: {size,count}`, `sizes: [{size,count}]`）→ je-nsonman形式（`mostFrequent: number`, `sizes: number[]`, `top10Sizes: [{size,count}]`）に変換
- `convertStrokeSizesForExport()`: 内部の `count` フィールドを除去、`size` + `fontSizes` のみ出力
- `convertPresetsForExport()`: 空の `subName` を省略、`description` に「使用回数:」を含む場合は省略
- `saveLocation`: `workInfo.label` をエクスポートデータに追加

**元スクリプトJSON互換（インポート）:**
- `loadPresetJson` のフォールバックで安全に変換
- `scannedFolders`, `textLayersByDoc`, `fonts` 等のアプリ専用フィールドが欠落する可能性 → 全タブでオプショナルチェーン (`?.`) ガード済み

**エラーバウンダリ:**
- `ErrorBoundary` コンポーネントを `ViewRouter` に適用
- レンダリングエラー時に真っ白画面ではなくエラーメッセージ＋再試行ボタンを表示

**主要ファイル:**
- `src/hooks/useScanPsdProcessor.ts` — スキャン実行、JSON/scandata保存・読込、ガイド自動選択
- `src/store/scanPsdStore.ts` — Zustandストア（persist未使用）
- `src/types/scanPsd.ts` — ScanData, PresetJsonData, ScanGuideSet, ScanWorkInfo, FontPreset等の型定義
- `src/components/scanPsd/ScanPsdContent.tsx` — 右パネル（モード選択、スキャンUI、サマリー、ファイルブラウザ）
- `src/components/scanPsd/ScanPsdPanel.tsx` — 左パネル（5タブ + 保存ボタン）
- `src/components/scanPsd/JsonFileBrowser.tsx` — basePath以下のJSON専用ファイルブラウザ
- `src/components/scanPsd/tabs/` — 各タブコンポーネント
- `src/components/ErrorBoundary.tsx` — React エラーバウンダリ

**ストアの主要状態:**
- `mode`: "new" | "edit" | null
- `scanData`: ScanData | null — スキャン結果または読み込んだデータ
- `presetSets`: Record<string, FontPreset[]> — フォントプリセットセット
- `workInfo`: ScanWorkInfo — 作品情報（genre, label, title, author等）
- `selectedGuideIndex`, `excludedGuideIndices` — ガイド選択・除外状態
- `currentJsonFilePath`, `currentScandataFilePath` — 現在開いているファイルパス
- `tempJsonFilePath`, `tempScandataFilePath`, `pendingTitleLabel` — 仮保存管理
- `jsonFolderPath`, `saveDataBasePath`, `textLogFolderPath` — 基本パス（localStorage永続化）

### 13. PSD準備（Prepare PSD / 統合処理）
- **概要**: 仕様修正（DPI/カラーモード/ビット深度）+ ガイド適用を1回のPhotoshopパスで統合実行
- **3つの実行パス**: (1) 統合処理（spec fix + guides）、(2) spec fixのみ、(3) guidesのみ
- **フック**: `usePreparePsd.ts` — NGファイル検出 + ガイド存在確認で対象を自動決定
- **スクリプト**: `prepare_psd.jsx` — 仕様変換とガイド適用を一括処理
- 処理後にメタデータ再読み込み＋仕様チェック自動再実行

### 14. 直接仕様変換（ag-psd + Rust、Photoshop不要）
- **概要**: Photoshopを起動せずにPSDメタデータ変更＋画像処理を実行（高速）
- **フック**: `useSpecConverter.ts`
- **2段階処理**: (1) ag-psdでメタデータ編集（DPI, colorMode, bitDepth, 非表示レイヤー削除）、(2) Rustで画像リサンプル/カラーモード変換
- **Rustコマンド**: `resample_image`（DPIリサンプリング、BICUBICフィルタ）、`convert_color_mode`（カラーモード変換）
- Photoshop版（`usePhotoshopConverter.ts`）とは別のアプローチ — メタデータのみの変更に最適

### 15. アプリ更新管理
- **フック**: `useAppUpdater.ts` — Tauri Updaterプラグイン使用
- **自動チェック**: アプリ起動2秒後にバックグラウンドで更新確認
- **フェーズ**: idle → checking → available → downloading → ready → relaunch
- 更新検出時にプロンプト表示、ダウンロード＆インストール後に1.5秒後自動再起動
- エラーハンドリング: エラー状態表示＋dismissボタン

### 16. 写植チェック（校正チェック）
- **概要**: MojiQ等が出力する校正チェックJSONを読み込み、校正指摘を一覧表示
- **データ構造**: `ProofreadingCheckData`（MojiQ JSON構造準拠）。`checks.variation` / `checks.simple` の2グループ。各項目に `checkKind`（correctness=正誤 / proposal=提案）
- **タブモード**: 正誤のみ / 提案のみ / 両方 の3モード切替。データ読み込み時に自動選択
- **カテゴリ表示**: `CheckCategoryGroup` でカテゴリ別にグループ化・折りたたみ表示。カテゴリ番号に対応した色パレット（10色）
- **検索**: デバウンス付きテキスト検索（excerpt, content, category, page）
- **ビューアー連動**: `TypesettingViewerPanel` でPSDプレビューと校正指摘を並列表示。ページクリックでビューアーのページに遷移（`navigateToPage`）
- **JSONブラウザ**: `JsonFileBrowser` を再利用してJSONフォルダからファイル選択
- **コンポーネント**: TypesettingCheckView, TypesettingCheckPanel, TypesettingViewerPanel, CheckCategoryGroup
- **ストア**: `typesettingCheckStore.ts` — checkData, checkTabMode, searchQuery, jsonBasePath, showJsonBrowser, navigateToPage

### 17. 写植確認（TypesettingConfirmPanel）
- **概要**: comicpotテキストデータにフォント指定を付与して保存する機能。フォント帳（プリセットJSON）を読み込み、テキストブロックにフォントを割り当て
- **コンポーネント**: `TypesettingConfirmPanel.tsx`（`src/components/typesetting-confirm/`）
- **テキスト解析**: `parseComicPotText()` でページ区切り `<<NPage>>` とブロック（空行区切り）を解析
- **テキスト保存**: `serializeText()` でフォント指定タグ付きテキストに変換
- **フォント指定書式**: `[font:PostScriptName(表示名(カテゴリ))]` — subNameなし時は `[font:PostScriptName(表示名)]`
- **sanitize処理**: フォント名・カテゴリ名から括弧文字（半角`()`・全角`（）`・角括弧`[]`）を除去して書式破壊を防止
- **validateFontTag**: 出力前に括弧バランスを検証。不正な場合はPostScript名のみにフォールバック（再発防止）
- **フォントプリセット読み込み**: Scan PSDのJSONフォルダからフォントプリセットJSONを選択・読み込み（`handleSelectFontJson`）
- **PDF見開き分割モード**: 見開きPDFのページ割り当て（none/coverSpread/skipCover/allSpread）
- **ビューアー連動**: 高解像度プレビュー + ページ遷移 + クロップ表示
- **ブロック操作**: 選択（Ctrl/Shift複数対応）、フォント割り当て、追加、並べ替え（D&D）、移動マーカー

### 18. テキスト抽出（Photoshop不要）
- **概要**: PSDファイルのテキストレイヤーからテキストを抽出し、COMIC-POT互換フォーマットで保存
- **データソース**: ag-psdで読み込み済みの`layerTree`から`textInfo.text`を取得（Photoshop不要）
- **出力フォーマット**: COMIC-POT互換テキスト
  - ヘッダー: `[COMIC-POT:bottomToTop]` または `[COMIC-POT:topToBottom]`
  - 巻ヘッダー: `[01巻]`
  - ページ区切り: `<<NPage>>`
  - テキスト内容 + 空行区切り
- **設定オプション**: レイヤー順序（下→上 / 上→下）、非表示レイヤー含むかどうか、**フォルダごとに分けて作成**（v3.7.1: 複数フォルダ時のみ表示、ONで各フォルダ名.txtに分割保存）
- **ルビレイヤー自動除外**: レイヤー名が`文字（ふりがな）`パターンに一致する場合スキップ
- **出力先**: `Desktop/Script_Output/テキスト抽出/{フォルダ名}.txt`（重複時はタイムスタンプ付き）
- **保存後にエクスプローラーで出力フォルダを自動表示 + 統合ビューアーのテキストタブに自動読み込み**
- **コンポーネント**: `TextExtractButton.tsx`（フローティングボタン+ポップオーバー設定+抽出ロジック）
- **配置ビュー**: 完成原稿チェック（右下、常時表示）、レイヤー制御（右下）、写植関連（写植仕様タブ・写植調整タブの右下）

### 19. ユーティリティ機能

**キャンバスサイズチェック** (`useCanvasSizeCheck.ts`):
- 全読み込みファイルのキャンバス寸法を分析、多数派サイズを検出
- 異なるサイズのファイルを`outlierFileIds`として検出
- 返却: `majoritySize`, `majorityWidth/Height`, `outlierFileIds`, `sizeGroups`

**ページ番号チェック** (`usePageNumberCheck.ts`):
- ファイル名から最後の連続数字を抽出（例: "タイトル_003.psd" → 3）
- 連番の欠番を検出（`missingNumbers`, `hasGaps`）
- ページ範囲 `[min, max]` を返却

**KENBAN差分ツール連携** (`launch_kenban_diff` Rustコマンド):
- 外部アプリ `KENBAN.exe`（`%LOCALAPPDATA%/KENBAN/KENBAN.exe`）を起動
- 2つのフォルダパスとモード（"tiff" / "psd"）を指定してビジュアル比較
- `KENBAN.exe --diff {mode} {folder_a} {folder_b}` で非同期起動

**フォルダ検出** (`detect_psd_folders` Rustコマンド):
- 指定フォルダ内のPSDファイルを含むサブフォルダを検出

### 20. 差分ビューアー / 分割ビューアー（v3.5.0でKENBANから完全移植、v3.6.0で大幅改善、v3.9.0で検版ツールへ独立化）
- **配置（v3.9.0〜）**: **検版ツール（`inspection`）ビュー内のサブタブ**（差分モード / 分割ビューアー）。[InspectionToolView.tsx](src/components/views/InspectionToolView.tsx) が `viewStore.kenbanViewMode` で2サブタブを切替
- **旧配置（v3.5.0〜v3.8.2）**: 統合ビューアータブ内のサブタブ（v3.9.0で検版ツールへ移動）
- **差分ビューアー** (`src/components/diff-viewer/DiffViewerView.tsx` + `src/store/diffStore.ts`)
  - **比較モード**: tiff-tiff / psd-psd / pdf-pdf / psd-tiff（PSD/TIFFは順序問わず双方向対応）
  - **表示モード**: 原稿A / 原稿B / 差分（ピクセル差分のヒートマップ・マーカー表示）
  - **ペアリング**: ファイル順 / 名前順
  - **オプション**: 差分のみ表示、マーカー表示、しきい値調整
  - **プレビューキャッシュ**: `previewMap` (filePath→URL) で全ファイルを並行プレビュー取得 → 差分計算前から表示
  - **自動差分計算**: ペア選択時に自動で Rust側 `compute_diff_simple`/`compute_diff_heatmap` を呼び出し（失敗してもプレビューは残る）
  - **不適切な組み合わせ判定**: `isValidPairCombination()` で compareMode に合わない場合は差分計算をスキップし、A単独表示。B側は赤いエラーカード表示
  - **タブ移動時の自動セットアップ**: 差分タブを開いた瞬間に `kenbanPathA/B` から filesA/B を自動読み込み + `computeCompareMode()` で compareMode 自動判定。**v3.7.2: A/B両方揃っている場合のみ読み込み実行**
  - **全画面（v3.7.2）**: サイドバー・ツールバー・ステータスバーすべて非表示、画像のみ表示。OSレベルフルスクリーン（タイトルバーも非表示）。Escapeで解除
  - **背景色（v3.7.2）**: 画像エリアを `#1a1a1e`（黒）に統一
- **分割ビューアー** (`src/components/parallel-viewer/ParallelViewerView.tsx` + `src/store/parallelStore.ts`)
  - **2パネル並列表示**: 左右独立にフォルダ/ファイル管理
  - **同期/独立モード**: 同期=両パネル同時ページング、独立=アクティブパネルのみ
  - **対応形式**: PSD/PSB/TIFF/JPG/PNG/BMP/PDF
  - **PDF全ページ自動展開**: PDF読み込み時に `kenban_get_pdf_page_count` で全ページを個別エントリ化（1ページずつページ送り可能）
  - **全画面（v3.7.2）**: ヘッダー非表示、画像エリアのみ表示。OSレベルフルスクリーン。Escapeで解除
  - **A/B必須（v3.7.2）**: 両パスが揃っている場合のみファイル読み込み実行
  - **背景色（v3.7.2）**: 画像エリアを `#1a1a1e`（黒）に統一
- **キーボード**: ↑↓ペア/ページ移動、Space表示モード切替、Ctrl+/-ズーム、S同期切替（分割）
- **TopNav A/B との双方向同期**: ビューアー内でフォルダ/ファイル選択 → `viewStore.kenbanPathA/B` に書き戻し、TopNavから変更 → ビューアー再読み込み（最新優先）
- **PDF ページ番号**: Rust側は0-indexed、フロント側は1-indexed → `pdfPage - 1` で変換
- **Rust連携**: `kenban_*` 21コマンドはそのまま流用（変更なし）

### 21. ProGen（React統合済み、v3.6.0で旧プロンプト完全互換移植）
- **3モード**: 抽出プロンプト / 整形プロンプト / 校正プロンプト — ドットメニューから直接モード選択可能
- **React完全移植済み**: iframe/バニラJS廃止、Zustand + Tailwind CSSで本体と統合
- **画面ルーター**: `progenStore.screen` で画面を切替（landing/extraction/formatting/admin/comicpot/resultViewer）
  - **注意**: v3.6.4で `proofreading` screen は廃止。校正モードも extraction screen（ProgenRuleView）を使用し、popup で正誤/提案ボタンを表示
- **ProgenView**: `viewStore.progenMode` → `progenStore.screen` 自動マッピング + ラベル自動読み込み
- **ツールメニュー連携（v3.6.4）**: TopNav ツール → ProGen の3モードから直接アクセス可能
  - `progenStore.toolMode` で現在のツールモード管理（"extraction" / "formatting" / "proofreading" / null）
  - TopNav click 時に toolMode + screen を同期的に設定（race condition 回避）
  - WFフラグ（`folderSetup_progenMode` / `progen_wfCheckMode`）を明示的にクリア
  - `extraction` screen に popup（下部固定）を表示:
    - `toolMode === "extraction"` → 🟠 抽出プロンプトボタン
    - `toolMode === "formatting"` → テキストなしならエラー、あれば 🔵 整形ボタン
    - `toolMode === "proofreading"` → テキストなしならエラー、あれば 🟢正誤 + 🟠提案 の2ボタン並列
- **新規作成のレーベル選択（v3.6.4）**: GENRE_LABELS（scanPsd.ts）による 2段階ドロップダウン（ジャンル → レーベル）。既存JSON読み込み時は従来の単一ドロップダウン
- **主要コンポーネント**:
  - `ProgenRuleView` — ルール編集（サイドバー7カテゴリ）。**v3.7.1: listMode prop**でカード表示（ツール経由）/テーブル一覧表示（スキャナー経由）を切替。カードモード: 追加フォームはカード最後尾にインライン3項目入力。テーブルモード: コンパクト行表示+最下部に3項目インライン追加フォーム。**v3.9.0 UI再構成**: メインエリア上部に **プロンプト生成ボタン横並びバー** を新設（[抽出][整形][正誤][提案] + コピー済表示 + 「校正用テキスト追加 ▾」「結果を貼り付け ▾」ドロップダウン）。サイドバーは「カテゴリ + 検索 + 保存ボタン」のみに簡素化。ルールカード `grid-cols-3`（v3.9.0、旧2列）。**ルール保存ダイアログ**: 保存後に成功/失敗を中央モーダルで表示（マスタールール+JSON保存先のパス詳細、未設定時は警告）。**校正用テキスト複数選択**: 現在のテキスト（常時自動）+ エクスプローラーから参照 + テキストフォルダから選択（チェックボックス付きフォルダブラウザ）。**parseCheckText改善**: 正誤/提案の自動判定（ヘッダー＋カテゴリ名ベース）。「Gemini を開く」単独ボタンは v3.9.0 で削除（プロンプトボタンは引き続き Gemini を自動オープン）
  - ~~`ProgenProofreadingView`~~ — **v3.6.4で厳重隔離**（ファイルは残すが、どこからもレンダリングされない）。校正は ProgenRuleView の popup で処理
  - `ProgenJsonBrowser` — GドライブJSONフォルダツリー（検索・読込・保存・新規作成）
  - `ProgenResultViewer` — 校正結果表示（3タブ+ピックアップ+CSV貼り付け）
  - `ProgenCalibrationSave` — 校正データ保存（TXTフォルダ選択→巻数入力）
  - `ResultSaveModal`（ProgenView内） — 校正結果保存モーダル。`parseCheckText()`でCSV・Markdownテーブル両対応→`{ checks: { simple, variation }, volume, savedAt }`形式で構造化保存。巻数入力付き、ファイル名`{N}巻.json`（v3.6.2でtimestamp廃止）。保存後にunifiedViewerStore.checkDataへ自動読み込み。**テキスト保存時のdesktopDir()末尾スラッシュ正規化済み（v3.6.4）**。**v3.6.6: テキスト保存後に COMIC-POT パース → unifiedViewerStore に textHeader/textPages も自動セット**（テキストタブで即座にページ別表示が可能）。**ファイル名フォーマット `{title}_YYYYMMDD_HHMMSS.txt`**（時刻まで含む）+ **同名ファイル存在時は `_2`, `_3`… の連番付与で重複回避**
  - `ComicPotEditor` — COMIC-POTテキスト編集（チャンク表示+D&D+ルビ+形式変換）
  - `ProgenAdminView` — パスワード付き管理画面（レーベルCRUD+ルール編集）
- **JSON 自動反映**: TopNav の作品情報JSON / `loadPresetJson` / `currentJsonFilePath` 変更時に proofRules を `progenStore.applyJsonRules` で自動適用 (basic/recommended/auxiliary/difficult/number/pronoun/character + symbol + options)
- **プロンプト生成 (`progenPrompts.ts`)**:
  - 旧 progen-xml-templates.js / progen-xml-gen.js / progen-check-simple.js / progen-check-variation.js を **TypeScript に完全移植** (生成XMLバイト単位で旧版と一致)
  - **抽出プロンプト** (`generateExtractionPrompt`): PDF only モード相当、3ステップ構成 (Text Extraction → Proofreading → Self-Check + final_output)
  - **整形プロンプト** (`generateFormattingPrompt`): TXT only モード相当
  - **正誤チェック** (`generateSimpleCheckPrompt`): フル版 7-8項目 (誤字/脱字/人名ルビ/単位/伏字/人物名/熟字訓 + 常用外漢字) + 統一表記ルール反映確認
  - **提案チェック** (`generateVariationCheckPrompt`): 10項目 (文字種/送り仮名/外来語/数字/略称/異体字/文体/固有名詞/専門用語/未成年表現)
  - **共通**: NGワードリスト (26語)、`escapeHtml` (旧版完全互換: `'`→`&#039;`、falsy判定)、`numberSubRules` / `categories` 定数も旧版互換
- **ScanPsdEditView統合**: 各機能をモーダルとして起動可能（ルール一覧/校正チェック/JSONブラウザ/結果ビューア/COMIC-POTエディタ）
- 全コマンドは `progen_` プレフィックス付き（Rust側変更なし）

### 22. 右クリックコンテキストメニュー
- **FileContextMenu.tsx**: SpecCheckViewの中央コンテンツエリアで右クリック → フローティングメニュー表示
- **PSDメニュー構成**:
  - Psで開く(P) / MojiQで開く(M)（PDF限定） / ファイルの場所を開く
  - txtファイル: セリフテキストとして読み込み / プレビュー中テキスト読み込み
  - カット / コピー / 複製（`duplicate_files` Rustコマンド） / 削除
  - PDF作成（Tachimi起動） / TIFF作成（ビュー遷移） / テキスト抽出
  - 編集 ▶ / リネーム ▶（このファイルをリネーム / バッチ / yyyymmdd形式） / A/B比較 ▶（A/Bにセット）
  - 読み込み ▶
- **フォルダ/非PSDメニュー**: フォルダを開く / Ps一括 / PDF作成 / A/B比較 / リネーム ▶（名前変更 / yyyymmdd形式） / カット / コピー / 複製（フォルダはcopy_folder） / 削除 / 読み込み
- **ファイル操作Undo（Ctrl+Z）**: 最大10操作。削除/カットはbackup_to_temp→restore_from_backup。複製は逆削除。リネームはbatch_rename_filesで逆変換（一括リネームも1操作）
- **サブメニュー位置補正**: onMouseEnter + requestAnimationFrameで上下左右clamp。state管理+300ms遅延クローズで安定したサブメニュー操作
- **グローバルPromptダイアログ**: `showPromptDialog()`（window.promptはTauri WebView2で動作しないため代替）。AppLayout内のGlobalPromptDialogで描画
- **リネーム処理**: Rust側`fs::rename`失敗時に`fs::copy`+`fs::remove_file`フォールバック（Windowsファイルロック対応）。invoke前にcache無効化
- **MojiQ自動検索**: `find_mojiq_path()` で7箇所+PATHから自動探索（全ユーザー対応）

### 23. ワークフローナビゲーション（v3.6.5 大幅刷新）
- **WorkflowBar.tsx**: TopNavのCBロゴ右横に「WF」ボタン。クリックで4ワークフローから選択
- **workflowStore.ts（v3.6.5新設）**: zustandストアで `activeWorkflow` / `currentStep` を一元管理
  - アクション: `startWorkflow` / `abortWorkflow` / `nextStep` / `prevStep` / `jumpToStep`
  - `WORKFLOWS` 定数もストア側に定義（複数コンポーネントから参照可能）
- **1ステップ=1工程（v3.6.5変更）**: 旧版の「開始/終了」2分割（`expandSteps`関数）を廃止。シンプルに1ステップ=1工程の構造に
- **4ワークフロー**:
  - **写植入稿**: 読み込み→仕様修正→ProGen整形→校正→テキスト修正→ZIP
  - **初校確認**: WF選択時にデータ読み込みオーバーレイ（PSD/画像PDF/テキスト/JSON/カラーモード選択、ZIP解凍対応）→読み込み（specCheck確認）→ビューアー確認（テキスト照合チェック→自動テキスト抽出→提案チェックまでスキップ）→提案チェックプロンプト→Tachimi見開きPDF→ZIP外部校正（ZIP作成後に自動WF完了確認）
  - **校正確認**: 校正確認→赤字修正→MojiQ→編集確認
  - **白消しTIFF**: 差し替え→差分検知→TIFF化→差分検知→TIFF格納
- **自動ナビゲーション**: 各ステップに`nav`（AppView）と`progenMode`を設定。ステップ進行時に自動画面遷移
- **ZIP リリースステップ**: `copyDestFolder`の親フォルダ（1_入稿レベル）を`requestPrep_autoFolder` localStorage経由でRequestPrepViewに自動セット
- **テキストチェックステップ**: copyDestFolder内のPDF/画像を自動検出してpsdStoreに読み込み。テキストタブを右端に自動配置、他タブ非表示
- **中断確認ダイアログ**: 中断ボタン押下時にstate管理のモーダルで「中止しますか？」を表示（window.confirm非使用）
- **進行確認ダイアログ（confirmOnNext, v3.7.3→v3.7.4）**: ステップ進行時にチェック確認。`specCheck`=NG/注意→警告/全合格→OK。`textSave`=未保存→保存ボタン/保存済→OK。`wfComplete`=WF終了確認（はい/いいえ）。`textDiffThenExtract`=テキスト照合不一致→警告/一致→自動テキスト抽出+提案チェックまでスキップ
- **初校確認WFオーバーレイ（v3.7.4）**: WF選択時にデータ読み込みオーバーレイ出現。PSD（フォルダ/ファイル/ZIP→2_写植に自動解凍+PSDフォルダ検出）→検A、画像PDF（フォルダ/ファイル）→検B、テキスト→読み取り、作品情報JSON/校正JSON→読み取りボタン、カラーモード必須。ZIP先選択→画像/PDF後選択で自動解凍対応
- **ZIP作成後WF自動完了（v3.7.4）**: RequestPrepViewでZIP作成成功後、WF進行中なら完了確認ポップアップ表示
- **extract_zip Rustコマンド（v3.7.4）**: ZIPファイルを指定ディレクトリに解凍
- **viewerTabSetup**: ステップ定義にタブ位置自動設定を追加（`{ text: "far-right", files: null, ... }`）
- **requestPrepMode**: ステップ定義にRequestPrepの初期モードを追加（"external"で外部校正タブに自動切替 + JSON workInfoからジャンル・レーベル自動セット）

### 23-b. WF表示（v3.6.5 全面リデザイン）
**WFアクティブ時は TopNav と アドレスバーを塗りつぶして全工程ナビゲーションUIに変更:**

**TopNav行（WorkflowBar フルバー）**:
- **ワークフロー名ピル**: グラデーション塗りつぶし（accent → accent-secondary）
- **戻るボタン**: 前のステップへ移動（最初のステップでdisabled）
- **進める/完了ボタン**: 次のステップへ移動。**最終ステップでは「完了」に変化し、緑色でWFを終了**
- **中断ボタン**: 赤色のX印、クリックでWF強制終了
- **全工程横並び（スクロール可）**: 各ステップを `flex items-center gap-1 overflow-x-auto` で横並び表示
  - アクティブステップ: アクセント色 + ring-2 リング強調
  - 完了済ステップ: success 色（緑）
  - 未着手ステップ: bg-tertiary + border
  - **全ステップクリックで自由にジャンプ可能**（`jumpToStep`）
- **非表示になる要素**: ツールメニュー / 設定 / リセット / NavBarButtons

**アドレスバー行（WorkflowDescriptionBar）**:
- WFアクティブ時は `GlobalAddressBar` を完全置換
- 構成: `[N/M] | ステップ名 | ステップ説明 | プログレスバー N%`
- **v3.6.6: 背景を `bg-bg-secondary`（純白の不透明）に変更**（旧: 半透明グラデーションだったため、AppLayout 全画面の `bg-tone` ドットパターンが透けて見えていた問題を解消）
- ディスパッチャパターン: `GlobalAddressBar` が wfActive で `WorkflowDescriptionBar` / `NormalAddressBar` を返す（hooks順序を保証）

**WF中も表示継続（v3.6.5）**:
- **TopNavDataButtons** (テキスト/作品情報JSON/校正JSON/A/B統合): WF中も読み込み操作を継続できるように表示維持
- ファイル数 / OK/NG / バージョン表示も継続

**WfDataPickerButton（v3.6.5）**: WF中のみ `テキスト・作品情報JSON・校正JSON` の3ボタンを **1つの「データ」ボタン + ホバードロップダウン** に統合
- A/Bピッカーと同じUXパターン（300ms遅延ホバー + 詳細パネル）
- メインボタン表示: `データ N/3`（N=読み込み済み件数、0件ならシンプル表示）
- ホバードロップダウン内の各項目:
  - タイトル（絵文字+カテゴリ名、色分け: 緑/紫/琥珀）
  - 状態表示（✓ 読み込み済み / 未読み込み）
  - クリアボタン
  - 読み込みボタン
- WF未起動時は従来の3つの個別 SmallBtn を表示

### 24. フォルダセットアップツール
- **FolderSetupView**: ツールメニューから起動。原稿フォルダを作業フォルダにコピー＋フォルダ構造を自動作成
- **3ステップUI**: コピー元（貼付/参照）→ 新作/続話選択 → コピー先選択 → 実行
- **ナンバリング自動検出**: フォルダ名から数字を抽出して番号フォルダを作成（手動修正可能）
- **テンプレート設定2種類**: アドレス指定（フォルダコピー）/ フォルダ構造（クリック取得、localStorage保存）
- **デフォルト構造**: 新作9フォルダ / 続話6フォルダ（アドレス未指定）。**DEFAULT_COPY_DEST = "1_入稿"**（v3.7.0で変更）
- **作品情報JSON**: 新規作成時はGENRE_LABELS（scanPsd.ts）による2段階ドロップダウン（ジャンル→レーベル）で選択。既存JSON選択は`JsonFileBrowser`モーダル（TopNavの作品情報ボタンと同じUI、scanPsdStore.jsonFolderPathをベースにしたツリー表示）
- **モード自動連動**: 新作選択時は`jsonMode="new"`、続話選択時は`jsonMode="select"`を自動セット（続話は前巻JSONの再利用が多いため）
- **create_directory / copy_folder Rustコマンド**: .keepファイル不使用
- **コピー完了後オーバーレイ（v3.7.3）**: 完了トースト（5秒自動消去）+ ファイル確認モーダル（PSD/PDF・画像/テキスト検出結果、追加コピーのステージング方式、カラーモード選択→specStore共有、作品情報JSON選択/新規、ProGenモード案内）

### 24b. 依頼準備ツール
- **RequestPrepView**: ツールメニューから起動。ファイル/フォルダをまとめてZIP圧縮
- **3モード**: 原稿入稿（テキスト/見本/原稿チェック）/ 外部校正（PDF/テキスト/統一表記表/NGワード）/ 白棒消し（PSD）
- **外部校正モード**: ジャンル→レーベル2段階ドロップダウン選択（GENRE_LABELS使用）、Gドライブから統一表記表を自動検索、NGワード表はデフォルト設定
- **内容自動検出**: サブフォルダ最奥まで再帰スキャン、TXT/PSD/画像/PDF種別を自動判定
- **ZIP名自動生成**: `yyyymmdd_ジャンル_タイトル_巻` — 作品情報JSON(`presetData.workInfo.genre/title`)参照、巻数はフォルダ名から検出（JSONのvolumeは無視）
- **JSON workInfo自動読み込み**: プリセットJSON読み込み時に`presetData.workInfo`からgenre/label/title/authorをscanPsdStoreにセット（volumeはセットしない）
- **WF自動読み込み**: `requestPrep_autoFolder` localStorage flag経由でFolderSetupのコピー先親フォルダを自動セット
- **Ingest/Whiteoutモード保存先**: Desktop内にzipName名サブフォルダを作成してZIP保存。`desktopDir()`の末尾スラッシュ正規化で正しいパス結合
- **ZIP内テキスト差し替え**: 元データは触らず一時フォルダにコピー → `findTxtRecursive`（`kenban_list_files_in_folder`+`list_folder_contents`再帰）でTXT検出 → unifiedViewerStoreの現在テキストで置換 → ZIP化 → 一時フォルダ削除
- **テキスト読み込み時のCOMIC-POTパース**: TopNav/FileContextMenu/SpecCheckViewの全テキスト読み込み箇所で`parseComicPotText()`を呼び、`textPages`/`textHeader`をstoreにセット。UnifiedViewer内のuseEffectで`textContent`変更時に`parseChunks`を自動実行
- **ProGen React移植（Phase 0-6完了、iframe廃止）**:
  - `src/types/progen.ts` — 全型定義+定数
  - `src/store/progenStore.ts` — Zustandストア（40+プロパティ）
  - `src/hooks/useProgenTauri.ts` — 26個のprogen_*コマンドのinvokeラッパー
  - `src/hooks/useProgenJson.ts` — JSON読み書き+CSV解析+カテゴリグループ化
  - `src/hooks/useComicPotState.ts` — COMIC-POTエディタ専用useReducerステート
  - `src/components/progen/ProgenRuleView.tsx` — ルール編集（6カテゴリ+Gemini+保存ボタン+Ctrl+S対応）
  - `src/components/progen/ProgenProofreadingView.tsx` — 校正チェック（正誤/提案）
  - `src/components/progen/ProgenJsonBrowser.tsx` — GドライブJSONブラウザ
  - `src/components/progen/ProgenResultViewer.tsx` — 校正結果ビューア（3タブ）
  - `src/components/progen/ProgenCalibrationSave.tsx` — 校正データ保存
  - `src/components/progen/ProgenAdminView.tsx` — パスワード付き管理画面
  - `src/components/progen/comicpot/ComicPotEditor.tsx` — COMIC-POTテキストエディタ
  - `src/components/progen/comicpot/ComicPotChunkList.tsx` — チャンク表示+D&D
  - `src/components/views/ProgenView.tsx` — React画面ルーター（6画面切替）
  - ScanPsdEditViewで各機能をモーダルとして起動可能
- **スキャナーJSON編集のTopNav連携**: ScanPsdModeSelectorで「JSON編集」選択時、TopNavで読み込み済みの作品情報JSON（`unifiedViewerStore.presetJsonPath`）があれば`loadPresetJson`で自動読み込み
- **create_zip Rustコマンド**: zip crate使用、フォルダ再帰対応、デスクトップに保存

### 25. 設定画面
- **SettingsPanel**: TopNavのツールメニュー横に歯車アイコン
- **一般タブ**: 文字サイズ(小/中/大) / アクセントカラー(8色、今後対応予定) / ダークモード / フォルダ階層デフォルト位置
- **ナビ/ツール配置タブ**: ナビバーとツールメニューに表示するボタンをチェックボックスで選択。チェック済みアイテムはドラッグで並べ替え可能（グリップハンドル＋番号表示）。未チェックは下部にグレー表示。「決定」ボタンで反映
- **永続化**: localStorageに保存

### 26. ファイルプロパティパネル
- **FilePropertiesPanel**: 右プレビューパネル下部に折りたたみ可能なプロパティ表示
- **表示項目**: ファイル名 / ドキュメント種類 / 作成日 / 修正日 / ファイルサイズ / 寸法(px/inch/cm) / 用紙サイズ / 解像度 / ビット数 / カラーモード / αチャンネル / ガイド / トンボ / レイヤー数 / チェック結果

### 31. v3.9.0 改修 — 検版ツール独立化・サイドバー幅統一・ProGen UI再構成・スキャナー常時全画面化

**1. 検版ツール（Inspection）ビュー新設**
- 統合ビューアー内のサブタブ「差分モード / 分割ビューアー」を独立した **`inspection`** ビューに切り出し
- 新規: [src/components/views/InspectionToolView.tsx](src/components/views/InspectionToolView.tsx) — 「差分モード / 分割ビューアー」の2サブタブを内包、`viewStore.kenbanViewMode` と双方向同期
- ヘッダーナビバー配置: ホーム → ビューアー → **検版ツール** → ProGen → スキャナー → レイヤー構造
- ツールドロップダウン: ProGen 3モード直下に「検版ツール」セクション（差分モード/分割ビューアー の2項目）
- アイコン: lucide `Shield`（盾）
- `viewStore.AppView` に `"inspection"` 追加。`ViewRouter` で **状態保持型マウント**（差分計算結果を保持）
- 統合ビューアー（[UnifiedViewerView.tsx](src/components/views/UnifiedViewerView.tsx)）はサブタブ撤去、`<UnifiedViewer />` のみに簡素化
- `settingsStore.migrateNavBar()` で既存ユーザーは `unifiedViewer` 直後に `inspection` + `progen` を自動挿入

**2. ProGen をヘッダーナビバーに追加**
- アイコン: lucide `Sparkles`（✨ AI/プロンプト生成の慣用）
- ナビバーから ProGen を開く場合は前回の状態を保持（toolMode/screen 初期化なし）。特定モード直行はツールドロップダウン経由

**3. サイドバー幅 → 272px 統一**（ホームと揃え）
| ファイル | 旧 | 新 |
|---|---|---|
| `DiffViewerView` | 220 | 272 |
| `UnifiedViewer.TAB_WIDTHS` 全タブ | 200/260/280/420/380/400 | 272 |
| `LayerControlView` / `ComposeView` / `RenameView` / `ReplaceView` | 360 | 272 |
| `SplitView` 設定 | 320 | 272 |
| `TiffView` 設定 | 400 | 272 |
| `FontBookView` | 200 | 272 |
| `ProgenRuleView` / `ProgenAdminView` ナビレール | 160 | 272 |
| `ProgenProofreadingView`（隔離中） | 280 | 272 |

維持した箇所: TiffFileList(210)、SpecViewerPanel/LayerSeparationPanel(320 = 内部サブパネル)、ScanPsdView は **400 のまま**（さらに改修2へ続く）

**4. スキャナー常時3カラム全画面化**
- [ScanPsdView.tsx](src/components/views/ScanPsdView.tsx) のルーティングを簡素化: モード選択後は **常に `ScanPsdEditView`**（3カラム全画面: 作品情報 / フォント種類等 / サイズ統計）
- 旧 `mode === "edit" && JSONロード済み` の条件撤去
- 旧 split layout（`ScanPsdPanel` 400px サイドバー + `ScanPsdContent`）は使われなくなる（ファイルは残存、必要なら復活可能）
- 追加スキャン / 巻数管理 / 保存 / 戻る はヘッダー右の固定ボタンから操作

**5. ProGen ルール編集 UI 再構成**
- **プロンプト生成ボタン横並びバー新設**: メインエリア上部に `flex items-center gap-2` の固定バーを設置
  - 左側: 「プロンプト生成」ラベル + [抽出][整形][正誤][提案] 4ボタン横並び + コピー済表示
  - 右側: 「校正用テキスト追加 ▾」「結果を貼り付け ▾」の2ドロップダウン（クリック開閉、外側クリックで閉じる）
- サイドバー旧 `GeminiButtons` 撤去 → サイドバーは「カテゴリ + 検索 + ルール保存」のみで非常にすっきり
- 「Gemini を開く」**単独ボタン削除**（4プロンプトボタンの自動 Gemini オープン挙動は維持）
- state は `ProgenRuleView` に持ち上げ（`textSources` / `copied` / `showTextPicker` 等）。テキストフォルダブラウザモーダルもメインエリア直下に移動

**6. ProGen ルール保存ダイアログ追加**
- 「ルールを保存」ボタン / `Ctrl+S` 押下時に成功/エラー結果を **中央モーダルダイアログ** で表示
- 成功時: 「✓ ルールを保存しました」+ 保存先（マスタールール: ラベル名 / 作品JSON: パス）詳細
- 保存先未設定時: 黄色文字で「何も書き込まれていません」警告
- エラー時: 赤色見出し + エラーメッセージ
- OK ボタン or 背景クリックで閉じる

**7. ProGen ルールカード 2列 → 3列**
- `ProgenRuleView` / `ProgenAdminView` の `grid-cols-2 gap-2` (6箇所) → `grid-cols-3 gap-2`
- 関連する `col-span-2`（5箇所、空状態「ルールなし」メッセージ）→ `col-span-3`

### 30. v3.8.2 改修 — 台割マネージャー準拠 Blue テーマ移行 + UI 全面整理

**コンセプト**: 台割マネージャー (`daidori-manager-tauri`) Light Mode に合わせた **クールホワイト基調 + Blue グラデ + 白文字** へ全面刷新。併せて UI を大規模整理。

#### カラーテーマ: Editorial Indigo → Daidori Blue
- `bg-primary`: `#fbfaf7` (クリーム) → `#f8f9fc` (クールホワイト)
- `accent`: `#4f46e5` (Indigo) → `#3a7bd5` (Blue)、`accent-hover`: `#4338ca` → `#0078d4`
- `accent-secondary/tertiary/warm` も全て Blue 系に再定義 → 既存 `from-accent to-accent-secondary` 系グラデーションが自動的に Blue 統一
- 旧ホットピンク/パープル/ミントの rgba shadow・glow を全て Blue rgba へ置換
- 新トークン `folder`（#f5b73d Windows風マニラフォルダ色）追加、全フォルダアイコンに適用
- フォント: Editorial Precision の Inter + IBM Plex Sans JP + JetBrains Mono 構成は維持

#### カラー絵文字 → SVG アイコン全面置換
- **FileContextMenu.tsx**: 30+ 絵文字 → lucide-react（`FolderOpen`/`Palette`/`Search`/`Scissors`/`Clipboard` 等）。A/B バッジは `BadgeA`/`BadgeB` カスタムspan
- **ProgenView.tsx**: 大見出しの 📝/🔍/✓/💡/⚠ → `FileEdit`/`Search`/`CheckCircle2`/`Lightbulb`/`AlertTriangle`
- **types/progen.ts EDIT_CATEGORIES**: ✏️👤🏷️ → 「表」「人」「名」の漢字1文字アイコン（既存「助/字/#/⋮」と統一）
- **ProgenProofreadingView**: 10個のチェックカテゴリの絵文字を漢字1文字・記号に置換
- **workflowStore.ts WORKFLOWS**: 📦📝✅🖼️ → 「入」「初」「校」「T」
- **diff-viewer / parallel-viewer / unified-viewer / FolderSetupView / RequestPrepView / TiffBatchQueue / TiffFileList 等** の 📁/📄/⚠/📋/🔍 類も全て lucide SVG + `text-folder` トークンで統一
- カテゴリ C（progenPrompts.ts の `♡♪` / `FONT_SHARE_PATH` の `■★` / placeholder の `★`）は **実データなので変更不可**として維持

#### レイアウト整理
- **コンテンツロック機能削除**: `psdStore.contentLocked` / `setContentLocked` 状態とアクションを撤去。仕様バーのロックボタン、D&D 時の自動ロック、アドレス変更ガードを全て削除
- **TopNav**:
  - A/B ピッカーボタン（`ABPickerButton`）削除 — 右クリックメニュー/差分・分割ビューアから引き続き操作可能
  - バージョン表示を TopNav 右端から SettingsPanel フッター左下へ移設（更新検出時のみ TopNav に促進バッジ）
  - リセットボタンを GlobalAddressBar の再読み込みボタン右隣へ移設、文言「読み込みリセット」、アイコンは MojiQ の `ClearAllIcon`（円＋×）
  - 「フォルダから開く」ボタンを設定ボタン右隣に追加（旧 GlobalAddressBar のフォルダ参照ボタンから移動）
  - OK/NG カラードット → 文字 `○` / `×`
  - ナビボタン 4 種（specCheck/unifiedViewer/scanPsd/layers）に lucide アイコン（Home/Eye/ScanLine/Layers）を付与
- **GlobalAddressBar**:
  - 台割マネージャーのツールバーパターンで **折りたたみ可能**（localStorage `addressBarCollapsed` で永続化）
  - 折りたたみ時は 14px の細いストリップ + シェブロントグルのみ残す
  - 戻る/進む/上 の chevron アイコン → **軸付きフル矢印** (`M19 12H5…` 等)
  - リセット確認モーダルもこのファイル内に集約（createPortal で body 直下に描画）
- **SpecCheckView**:
  - 空だった「Bar 1: View controls」撤去（ドットメニューは GlobalAddressBar 移設済）
  - 仕様バーの OK/NG 件数表示・再チェックボタン削除（`useSpecChecker()` 自体はフックコール維持で自動チェック継続）
  - 仕様セレクタ: 単一ループ型ボタン → **セグメント型トグルスイッチ**（モノクロ / カラー）。「仕様:」ラベル削除
  - 昇順/降順: ボタン → `<select>` ドロップダウン（`昇順` / `降順`）
  - **両サイドパネル折りたたみ** (左: 詳細/フォルダ階層, 右: プレビュー): `transition-[width] duration-300` で `w-[272px] ↔ w-8` アニメーション、≪≫ 二重シェブロンで開閉。プレビューの旧 ×閉じるボタンは ≫ に置換、折りたたみ中のストリップは ≪ ボタン
  - パネル幅 `w-[320px]` → **`w-[272px]`**（左右合計 96px 削減でサムネエリアを広く）
  - **下部アクションバー**: ガイド編集/PDF化/簡易スキャン/テキスト抽出/一括変換 の 5 ボタンを `h-16→h-10` / `text-lg→text-base` / `gap-3→gap-1.5` / `px-8→px-4` にコンパクト化、`flex-nowrap`+`whitespace-nowrap` で横 1 列化。ファイル数バッジ撤去
  - 下部領域に **白背景 + 上端 border + 右 12px オフセット（スクロールバー回避）** を追加、`showActionBar` state で折りたたみ可能
  - 折りたたみ時は右下隅に `h-7 w-9 rounded-tl-md border-l` の小ノッチ + `≫` 二重シェブロントグルのみ残す（サイドバーの下バージョン）
  - ボタンと折りたたみトグルの間に縦区切り線
- **FolderBreadcrumbTree**:
  - 内部の「フォルダ階層」見出しトグル削除（外側パネルヘッダーで開閉一元化）
  - 長いフォルダ名の折り返し 2 行目を **左揃え**（`text-left items-start break-all`）
- **LayerTree / UnifiedSubComponents**: ゼブラストライプ色 `#f0f8f0`（薄緑）→ `#eaf2fb`（薄青）
- **FileContextMenu**: 「Psで開く」→ 「Ps」、「フォルダ内をPsで開く」→ 「フォルダ内をPs」
- **各種ビューアーの「フォルダを開く」アイコンボタン削除**（6箇所、F キーショートカット + 右クリックメニューから引き続き利用可能）

#### プレビューパネル / 詳細パネル アニメーション仕様
- 外側コンテナは常に描画し、内部のみ条件切替で React のマウント/アンマウントによる幅アニメ停止を回避
- `overflow-hidden transition-[width] duration-300 ease-out` を外側に付与
- ヘッダー帯 `h-8 border-b border-border/50 flex items-center px-2 gap-1` は展開/折りたたみとも共通、中の ≪≫ ボタンだけが切り替わる

#### 意図的に維持した色
- Photoshop ブランドブルー `#31A8FF` / `#0066CC` / `#001E36`（Ps 起動ボタン）
- 分割ビューアー L/R 識別シアン `#00bcd4` / `#00e5ff`
- ダークモード反転用黒背景 `bg-[#1a1a1e]`（`dark-mode-invert` で恒等変換される）
- PSD レイヤータイプアイコン（`text-[#f06292]` 等）— フォルダではなくレイヤー種別の識別色
- 警告系 `rgba(245,158,11,*)` amber — トースト・個別オーバーライド・テキスト overflow 警告等の意味的用途
- ScanPsdEditView の `SECTION_COLORS`（pink/purple/mint/warm/sky）— セクション見出しのカテゴリ識別用

### 29. v3.8.1 改修 — ダークモード画像反転問題の修正

**問題**: ダークモード有効時、UIだけでなく**ビューアー表示画像も色反転**していた。

**原因**:
- 従来実装 ([AppLayout.tsx](src/components/layout/AppLayout.tsx)) で `<html>` に `filter: invert(0.92) hue-rotate(180deg)` を適用
- 打ち消し用に `querySelectorAll("img, video, canvas, iframe")` でその時点の要素に `filter: invert(1) hue-rotate(180deg)` を設定
- **問題2つ**:
  1. `invert(0.92)` と `invert(1)` の数値不一致 → 完全相殺されず色がわずかにズレる
  2. `querySelectorAll` はワンショット → 後から動的ロードされた画像（ビューアー画像等）は対象外

**修正** ([globals.css:542-593](src/styles/globals.css#L542), [AppLayout.tsx:34-54](src/components/layout/AppLayout.tsx#L34)):
- JS側: インライン `filter` 設定を廃止。`<html>` に `dark-mode-invert` クラスを付けるだけに変更
- CSS側: 数学的に完全一致する `invert(1) hue-rotate(180deg)` を2段階で適用
  ```css
  html.dark-mode-invert { filter: invert(1) hue-rotate(180deg); background: white; }
  html.dark-mode-invert img,
  html.dark-mode-invert video,
  html.dark-mode-invert canvas,
  html.dark-mode-invert iframe,
  html.dark-mode-invert [data-no-invert],
  html.dark-mode-invert picture,
  html.dark-mode-invert svg image {
    filter: invert(1) hue-rotate(180deg);
  }
  ```
- **ビューアー背景 (`#1a1a1e`) は暗転後も黒を維持**: pre-inverted 値 `#e5e5e1` を上書きして html レベルの invert で相殺
  ```css
  html.dark-mode-invert .bg-\[\#1a1a1e\] {
    background-color: #e5e5e1 !important;
  }
  ```

**効果**:
- `invert(1) × invert(1) = identity`、`hue-rotate(180°) × hue-rotate(180°) = 360° = 0°` で数学的に恒等変換
- CSS セレクタによる適用なので、動的追加された画像・PDF.js canvas・後から挿入される img にも**自動適用**
- `data-no-invert` 属性を付けた任意の要素は反転対象から除外可能（将来拡張用）
- 切替時のチラツキを抑える `transition: filter 0.15s`

### 28. ProGen 外部設定同期（⚠ **試運転中 — 未検証**）

> **⚠ 重要: この機能は試運転段階です。**
> 実運用での動作確認はまだ行われていません。共有ドライブへのアクセス挙動・同期タイミング・キャッシュ整合性などは後日の実地検証が必要です。
> 不具合が見つかった場合は フォールバック（埋め込み既定値）で動作は継続する設計ですが、**この機能に依存した運用変更は動作確認完了まで控えてください**。

**目的**: ProGen のプロンプト生成で使う一部データ（NGワード・数字ルール・カテゴリ名）をアプリ再ビルド無しで共有ドライブから更新できるようにする。

**配置先（共有ドライブ）**:
```
G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\Comic Bridge_統合版\Pro-Gen\
├── version.json       ← バージョン管理（SemVer）
└── config.json        ← NGワード / 数字ルール / カテゴリ
```

**フロー**:
1. アプリ起動時に [App.tsx](src/App.tsx) が `initProgenConfig()` を非同期呼出
2. まずローカルキャッシュ (`%APPDATA%\comic-bridge\progen-cache\`) を読込 → 即時反映
3. 続いて Rust コマンド `fetch_progen_config` で共有ドライブの `version.json` を確認
4. SemVer 比較で新しければ `config.json` をキャッシュに上書き → 再読込

**主要ファイル**:
- [src/lib/progenConfig.ts](src/lib/progenConfig.ts) — ローダー + 埋め込みフォールバック
- [src-tauri/src/commands.rs](src-tauri/src/commands.rs) — `fetch_progen_config` / `read_progen_cached_file` コマンド
- [src/lib/progenPrompts.ts](src/lib/progenPrompts.ts) — `Proxy` 経由で `ngWordList`/`numberSubRules`/`categories` を動的参照化（既存コード変更最小）
- [docs/progen-template/](docs/progen-template/) — 共有ドライブ配置用の初期テンプレート + 運用README

**フォールバック階層**（信頼性確保）:
1. リモート同期済みキャッシュ
2. 既存ローカルキャッシュ
3. 埋め込み既定値（ビルド時点のもの、[progenConfig.ts:DEFAULT_*](src/lib/progenConfig.ts)）

**共有ドライブ切断時・JSON破損時も本体動作は継続**。フィールド単位でフォールバック。

**更新手順（運用後）**:
1. 共有ドライブの `config.json` を編集（NGワード追加・カテゴリ表示名変更など）
2. `version.json` の `version` をインクリメント（例: `1.0.0` → `1.0.1`）
3. 保存するだけ — 次回アプリ起動時に全ユーザー環境へ自動反映

**変更してはいけない要素**:
- `categories` のキー名（`basic`/`recommended` 等、コードから参照されている）
- `numberSubRules` のオプション配列順序（既存の保存済みJSONデータとインデックスで紐づくため、並び替え・削除は既存データ破壊のリスクあり、**末尾追加のみ推奨**）

**動作確認待ちの項目**:
- [ ] 初回セットアップで G:\ にテンプレートを配置 → 起動 → キャッシュ作成確認
- [ ] `config.json` の内容変更 + `version.json` インクリメント → 再起動 → 新内容反映確認
- [ ] 共有ドライブ切断環境での起動 → キャッシュフォールバック動作確認
- [ ] JSON壊れ・部分欠損時のフィールド別フォールバック確認
- [ ] 実際のプロンプト生成結果に反映されるかの確認（ProGen 実行 → 生成XML内でNGワードが期待通りに扱われるか）

### 27. v3.8.0 新機能・改修

**モノクロ2階調（Bitmap）PSD対応** ([commands.rs:2154-2290](src-tauri/src/commands.rs#L2154))
- `load_psd_composite` に depth=1 / color_mode=0 (Bitmap) を追加
- `unpack_bitmap_to_grayscale()` / `decode_rle_bitmap()` を新設（PackBits展開+MSBアンパック）
- 従来 psd crate フォールバックで失敗していた2階調PSDが高速パスで処理される
- 画像エリアの拡大表示が2階調で破綻する問題を解消

**統合ビューアー リロードボタン強化** ([commands.rs:122-152](src-tauri/src/commands.rs#L122))
- `invalidate_file_cache` がメモリキャッシュだけでなく、ディスク上の JPEG キャッシュ (`manga_psd_preview_*.jpg` / `manga_pdf_preview_*.jpg`) も削除するように拡張
- これによりビューアー右上のリロードボタンで完全再生成されるようになった（古い画像が残る問題を解消）

**TIFF化 2大プリフライトチェック**（Photoshop ベース）
- **メトリクスカーニング検出**: `tiff_convert.jsx` の `detectMetricsKerningLayers()` / `hasMetricsKerning()`。ActionManager で `textKey > textStyleRange > textStyle > autoKern` を走査し `metricsKern` を検出 → `TiffResultDialog` に警告表示
- **リンクグループ フォントサイズ検証**: `detectLinkGroupFontSizeIssues()`。各テキストレイヤーの `linkedLayerIDs` を直接読み、Union-Find でグループ構築 → 「同一サイズ」または「きっかり1:2」以外を通知（誤差ゼロ 0.001pt のみ許容）
- 結果は `TiffConvertResult.metrics_kerning_layers` / `link_group_issues` として Rust → フロントに連携、`TiffResultDialog` で詳細展開可能

**レイヤー構造 診断バー（LayerDiagnosticsBar）**
- **設置場所**: SpecLayerGrid（仕様チェック：レイヤー構造タブ）と LayerPreviewPanel 両方
- **未インストールフォント**: あり/なし バッジ + クリックで展開（フォント名一覧） + 「🔍 共有フォルダから探す」ボタン
- **共有フォルダ検索**: `FontBrowserDialog`（写植関連から再利用）をモーダル表示。パンくずナビ + 検索 + チェックボックス複数選択 + 一括インストール + 自動フォント再解決
- **検索フォルダアドレスは UI 非表示**: `FONT_SEARCH_BASE_PATH` 定数で内部保持のみ
- **白フチサイズ数値バッジ**: `{size}px ×{count}` 形式（ag-psd の `layer.effects.stroke[]` から抽出）
- **カーニング値（トラッキング）バッジ**: `+25 ×N` / `-50 ×N` 形式（textInfo.tracking から、0以外のみ）。メトリクスは読み込み時点では判定不能のため除外

**parser.ts 白フチ・リンクグループ抽出強化** ([parser.ts:218-232, 323-341](src/lib/psd/parser.ts))
- LayerNode に `linkGroup?` / `linkGroupEnabled?` を追加（ag-psd の同名プロパティから抽出）
- TextInfo に `strokeSize?` を追加（`layer.effects.stroke[]` の最初の enabled エントリから `size` を取得、UnitsValue/number 両対応）

**統合ビューアー / SpecLayerGrid テキスト行バッジ**
- 各テキストレイヤー行に 白フチ / カーニング値 バッジを直接表示
- 統合ビューアー写植仕様タブ ([UnifiedViewer.tsx:1421-1441](src/components/unified-viewer/UnifiedViewer.tsx#L1421)) と SpecLayerGrid カード ([SpecLayerGrid.tsx:196-218](src/components/spec-checker/SpecLayerGrid.tsx#L196)) の両方
- 既存の「非シャープ」「メトリクス」バッジと並列表示

**使用フォント一覧を 写植仕様タブに統合** ([UnifiedViewer.tsx:1323-1372](src/components/unified-viewer/UnifiedViewer.tsx#L1323))
- テキストタブの単一ファイル版フォント一覧を削除
- 写植仕様タブに 全ファイル版 `allFilesFontMap` ベースの一覧を配置（N種/全Nファイル、ファイル数バッジ、クリックで対象ページ巡回）

**ProGen 結果保存モーダル 刷新** ([ProgenView.tsx ResultSaveModal](src/components/views/ProgenView.tsx#L89))
- JSONモードで 2カラム貼り付け（正誤 + 提案 同時入力、各欄緑/橙の色分け）
- 各欄個別パース → `checkKind` を「正誤=correctness」「提案=proposal」で強制設定
- **作品情報JSON未登録時のガード**: `currentJsonFilePath` が空 or `label/title` 未設定なら、モーダル内に ジャンル/レーベル/タイトル インラインフォームを表示
- 保存時は まず `performPresetJsonSave()` で作品情報JSON新規作成 → 次に校正JSON保存（順序厳守）
- 保存先プレビュー2行表示（作品情報JSON + 校正JSON）、完了メッセージも新規作成時は「作品情報JSONを新規作成し、校正JSONを保存しました」

**Scan PSD 作品情報 Notion ページ** ([scanPsd.ts:16, WorkInfoTab.tsx, WorkflowBar.tsx](src/types/scanPsd.ts#L16))
- `ScanWorkInfo.notionPage?` フィールド追加、WorkInfoTab にインライン入力＋「開く」ボタン
- **WF完了時**: WorkflowBar + RequestPrepView の「はい」ボタンで `open_url_in_browser` 経由で自動起動
- **URL オープン 3段フォールバック** ([commands.rs:open_url_in_browser](src-tauri/src/commands.rs)): ① open crate (ShellExecute) ② rundll32 url.dll,FileProtocolHandler ③ powershell Start-Process。URL 内 `&` による cmd escape 問題を回避

**差分/分割ビューアー Photoshop起動**
- 分割ビューアー各パネルに「Ps」ボタン + Pキーショートカット ([ParallelViewerView.tsx:226](src/components/parallel-viewer/ParallelViewerView.tsx#L226))
- 差分ビューアーも Pキーショートカット追加（既存Psボタンに加え）([DiffViewerView.tsx:145](src/components/diff-viewer/DiffViewerView.tsx#L145))

**レイヤー制御タブ 復元** ([settingsStore.ts:15](src/store/settingsStore.ts#L15))
- ALL_NAV_BUTTONS に `{ id: "layerControl", label: "レイヤー制御" }` 追加
- デフォルトツールメニューに追加、既存ユーザーへのマイグレーション関数 `migrateToolMenu` で自動追加
- TopNav 両ハンドラに `layerControl → setActiveView("layers")` 分岐

**初校確認WF 改修** ([workflowStore.ts:50](src/store/workflowStore.ts#L50))
- 「レイヤー構造確認」ステップを追加（初校データ読み込み → レイヤー構造確認 → ビューアーで確認・修正）
- WFステップ進行時に `resolve_font_names` で未インストールフォント検知 → 警告ダイアログ（ステップごとに1回のみ）
- ProofLoadOverlay: 「→検A」「→検B」表記削除、画像必須を解除（任意化）

**FolderSetup 画像/PDFブロック解除** ([FolderSetupView.tsx:1029](src/components/views/FolderSetupView.tsx#L1029))
- 画像/PDFがない場合も進行可能（警告バナーのみ表示）
- `canProceed = selectedSpecId && fileCheck.hasPsd` （PDF/画像要件を撤廃）

**ホーム フォルダ階層 傾き半減** ([SpecCheckView.tsx:1905,1924](src/components/views/SpecCheckView.tsx#L1905))
- 親階層 & サブフォルダの `paddingLeft` を `i * 12px` → `i * 6px` に変更
- 深い階層での水平オフセットが半減、傾きが緩やかに

### 22. 統合ビューアータブ（UnifiedViewerView）
- **構成（v3.9.0〜）**: サブタブ撤去、`<UnifiedViewer />` のみを表示する単一画面。差分モード / 分割ビューアーは [検版ツール](#20-差分ビューアー--分割ビューアーv350でkenbanから完全移植v360で大幅改善v390で検版ツールへ独立化)へ移動
- **統合ビューアー（UnifiedViewer）**: 2カラムレイアウト（左パネル廃止）
  - **タブバー**: 右寄せで全タブボタンを表示 + ◀▶配置移動ボタン。クリックで表示/非表示トグル。◀▶で選択中タブの配置位置を移動（左端↔左サブ↔右サブ↔右端、中央ビューアーはスキップ）
  - **5スロットパネルシステム（v3.7.0）**: 左端 / 左サブ / [中央ビューアー+ページリスト] / 右サブ / 右端。各パネルはタブ固有の適切な幅（`TAB_WIDTHS`）で表示。WFステップで`viewerTabSetup`によりタブ配置を自動制御可能
  - **タブ入れ替え記憶（displacedTabs）**: タブ移動時に押し出されたタブを記憶。移動元が空いたら自動復帰（既に別位置に移動済みなら復帰しない）
  - **共通タブ**: ファイル / レイヤー / 写植仕様 / テキスト / 校正JSON / テキスト照合 — 任意のパネル位置に自由に割当可能（`renderTabContent`共通関数）
  - **レイヤータブ（v3.7.0）**: FullLayerTree（metadata/LayerTree.tsx）使用。レイヤークリックで画像ビューアー上にSVG矩形ハイライト（対象レイヤー位置表示）。ファイル切替時にハイライト自動リセット
  - **写植仕様タブ（v3.7.1）**: フォントプリセット表示を削除。**スクショキャプチャ機能追加**: フォント選択中に「スクショ」ボタン表示→キャプチャモードON→ビューアー上でドラッグ範囲選択→暗転マスク+破線枠表示→マウスアップでCrop→JPEG→フォント帳に自動保存（crossOrigin対応でtainted canvas回避）
  - **ページリスト**: 中央ビューアー左端に幅32pxの縦ページ番号リスト。クリックでページ移動。現在ページはアクセントカラーで強調
  - **中央**: 画像ビューアー（ズーム/パン対応、PDF.js描画、PSD/画像はRust `get_high_res_preview`）。**リロードボタン（v3.7.0）**: 画像エリア右上に常時表示、クリックでキャッシュクリア+再読み込み（画像表示失敗時の復旧用）
    - ナビバー: ◀▶ページ送り / ズーム / 単ページ化ボタン / メタデータ（DPI/カラーモード/用紙サイズ）
    - **単ページ化（見開き分割）**: [単ページ化]トグル + [1P単独/1Pも見開き/1P除外]選択 + [左→右/右→左]読み順切替
    - `logicalPage`カウンターで全ファイル×前後をフラットに管理。`resolveLogicalPage(lp)`で(fileIdx, side)を同期計算
    - 単ページ化時の画像半分表示: ラッパーdiv `overflow:hidden` + `width:50%` + img `width:200%` で縦横比維持
    - ◀▶で`logicalPage ± 1`するだけで前半分→後半分→次ファイル前半分と自動進行
    - PDFキャッシュキー: `f.pdfPage`を含める（`${path}#p${page}`）で同一PDF別ページを区別
  - **右パネル**: 同上の共通タブ
  - **テキストタブ（v3.7.3）**: 編集モード廃止、**ダブルクリックインライン編集に統一**（SortableBlockItemのテキスト部分をダブルクリック→textarea展開、Ctrl+Enter確定/Escキャンセル）。ツールバー: +追加ボタン（現在ページにブロック追加）+ +フォントボタン + 選択中は✕解除/削除//。DnDブロックリオーダー（ドラッグハンドル+位置番号右端表示）。フォント割当ドロップダウン。ページヘッダー「+」ブロック追加（各ページ末尾）。ページ番号クリックで常にビューアーが該当ページに移動（pageSync不問）。handleSave: serializeTextで再構築して保存。Ctrl+S対応
  - **テキスト照合タブ**: KENBAN版LCS文字レベルdiff移植。PSDレイヤー↔テキストブロックのリンクマッピング。差異ありのみ2カラム、一致はPSD/テキスト切替で1カラム。漫画読み順ソート。`normalizeTextForComparison` + `computeLineSetDiff` + `buildUnifiedDiff`。ファイル一覧に✓/⚠アイコン。`//`先頭ブロックは「テキスト削除確認」として黄色警告表示（照合対象から除外、差異としてカウントしない）。textPagesが空の場合はtextContent全体をフォールバック比較
  - **校正JSONタブ**: 正誤/提案/全て切替、カテゴリフィルタ、ページ連動
  - **キーボード**: ←→ページ送り、Ctrl±ズーム、Ctrl+0フィット、Ctrl+S保存、Pキーで現在のファイルをPhotoshop起動
  - **右クリック**: FileContextMenu（viewerMode: カット/コピー/複製/削除/読み込みを非表示）
  - **ページ連動**: `navigateToTextPage`関数で単ページ化モード対応。logicalPageを走査してテキストページ番号に対応するページを特定
  - **psdStore同期**: メイン画面のファイルを`doSync`でビューアーストアに自動反映。タブ切替時にキャッシュクリア+`loadImageRef`で画像再読み込み。PDF情報（`isPdf`/`pdfPath`/`pdfPage`）も正しくマッピング（0-indexed→1-indexed変換）
- **差分モード / 分割ビューアー（v3.9.0〜）**: 統合ビューアーから撤去 → 検版ツール（`InspectionToolView`）へ移動
- **全画面表示**: PSD/画像はCSS object-containで自動リサイズ（再取得不要）。PDFはisFullscreen依存のuseEffectでcanvas再描画
- 条件レンダリング: タブ切替で毎回マウント/アンマウント（検A/B propsを確実に反映）
- **検A/検B連携**: TopNavの検A/Bで選択したフォルダパスをexternalPathA/B propsで渡し、KenbanApp内でuseEffectで自動読み込み（filesA/B + parallelFilesA/B 両方にセット）。PDF/PSD/TIFF自動判定
- **隔離中**: 検版（KenbanView）とレイヤー分離確認（LayerSeparationPanel）はドットメニュー/ビューモードから除外、コンポーネントのマウント無効化（統合完了後に削除予定）

## UI構成

### レイアウト
- **TopNav** (h-14): WF（左端）| ツールメニュー（ホバー表示、300ms遅延クローズ）+ 設定 | リセットボタン（確認ダイアログ付き、テキスト/JSON/検A・Bも全クリア）| ナビバー（左寄せ）| flex-1 | テキスト/作品情報/校正JSON/差分分割/A・B統合ボタン（右寄せ、300ms遅延クローズ、**v3.7.1: ホバーで読込中フォルダ名/ファイル名/タイトルをツールチップ表示**）| ファイル数+OK/NG | バージョン。全画面時は非表示
- **GlobalAddressBar**: 戻る/進む/上/フォルダ参照/再読み込み | アドレスバー/×クリア。全画面時は非表示
- **ツールメニュー**: ホバーで自動表示。全タブ + ProGen3モード + 検版ツール2モード（v3.9.0: 差分モード/分割ビューアー、ProGen直下にセクション形式で配置）
- **ナビバー（v3.9.0デフォルト）**: ホーム → ビューアー → 検版ツール（盾アイコン） → ProGen（Sparklesアイコン） → スキャナー → レイヤー構造。`settingsStore.migrateNavBar()` で既存ユーザーは `unifiedViewer` 直後に `inspection` + `progen` を自動挿入
- **A/B統合ボタン**: ホバーでA（青）/B（橙）の選択ドロップダウン。フォルダ/ファイル選択、パス表示、クリア。`validateAndSetABPath`で検証（ファイルなし/テキストのみは静かにスキップ、複数拡張子混在はconfirm）。差替え/合成のDropZoneはマウント時にkenbanPathA/Bを自動参照
- **D&D時A自動セット**: Aが未セットの場合のみ検証付きで自動セット。巻数はJSONのvolumeを無視しフォルダ名から検出
- **ViewRouter + viewStore**: タブベースのビュー切替管理。AppView型:
  ```typescript
  export type AppView =
    | "specCheck" | "layers" | "split" | "replace" | "compose"
    | "rename" | "tiff" | "scanPsd" | "typesetting"
    | "progen" | "unifiedViewer"
    | "folderSetup" | "requestPrep"
    | "inspection";  // v3.9.0で追加（検版ツール）
  ```
  progen / unifiedViewer / inspection は状態保持型マウント（display切替）。typesettingは隔離中（マウント無効化）
- **AppLayout**: TopNav + GlobalAddressBar + ViewRouter構成。グローバルD&Dリスナー（useGlobalDragDrop）。全画面時はTopNav/GlobalAddressBar非表示
- **D&Dオーバーレイ**: ファイルをドラッグ中にホーム画面を暗くし「ドラッグして読み込み」を表示（Tauri `onDragDropEvent` enter/leave監視）
- **DropZone（空状態）**: ファイル未読み込み時、中央エリアをクリックするとフォルダ選択ダイアログを表示。D&Dも対応
- **右クリックコンテキストメニュー**: FileContextMenu — ファイル操作/編集/読み込みの階層メニュー

### ビュー
- **LayerControlView**: レイヤー制御パネル + LayerPreviewPanel（レイヤー構造タブ + ビューアータブ）。**サブタブ構成**: 「レイヤー制御」「リネーム」の2タブ。リネームタブはRenameViewをそのまま内蔵
- **SpecCheckView**: ホーム画面。エクスプローラー風ファイルブラウザ + 仕様チェック
  - アドレスバー（GlobalAddressBar）でフォルダ移動。D&Dも対応（フォルダ単品D&D→そのフォルダの中身を直接表示）
  - 中央エリア上部: ビューモード切替バー + 仕様バー（仕様選択/統計/サイズ/ソート/PSD/PDFフィルタ/ドットメニュー）
  - viewMode切替: サムネイル（PreviewGrid）、リスト（PsdFileListView）、レイヤー構造（SpecLayerGrid）
  - SpecLayerGrid: 写植仕様（テキストレイヤーフォント/サイズ情報）+ レイヤーツリーを統合表示。「写植仕様のみ」チェック。上部に全ファイル合計サマリー（使用フォント出現数/サイズ統計/AA判定）
  - LayerTree: ゼブラストライプ背景（白/#f0f8f0交互、useEffect+DOM操作でStrictMode対応）、階層区切り線。テキストレイヤーにフォント名/サイズ/シャープ以外エラー表示
  - フォントサイズ: ag-psdのfontSizeにtransform[3](Yスケール)×72/DPIを掛けてPhotoshop表示ポイント値に変換。Rust側も同様
  - シャープ判定: `includes("sharp")` or `"ansh"`で小文字マッチ（ag-psd/Rust両対応）。シャープは非表示、シャープ以外のみ赤エラー
  - メトリクスカーニング: PSDバイナリからの正確な検出は不可（/AutoKerning trueがメトリクス/0を区別できない）。Rust側は無効化済み
  - リスト表示: 列順＝結果/ファイル名(拡張子非表示)/種類バッジ/カラー(白黒表記)/サイズ/DPI/Bit/テキスト(あり/なし)/ガイド(あり/なし)。NG行は赤背景、Caution行は黄色背景
  - 仕様選択: 単一ボタンクリックで仕様を順に切り替え（ループ）
  - キーボード操作: 左右キーで前後ファイル移動、上下キーでグリッド行移動（列数自動計算）
  - 右プレビューパネル: プレビューのみ（アクションタブ廃止）。画像表示＋プロパティ＋テキスト情報
  - ファイルプロパティ: プレビュータブ時のみ表示。寸法(cm)+用紙サイズ併記、作成日/インチ表示なし
  - フォルダ階層ツリー: 常時表示（ファイル未選択時はデスクトップパスを表示）。クリックで上位フォルダに移動。サブフォルダも表示（list_subfolders）。ドライブレター修正対応。ファイル名ヘッダーはフォルダ階層の下に配置。ダブルクリックでリネーム可能
  - フォルダ/テキスト/JSONの選択: 左クリックで水色ハイライト選択。右クリックでコンテキストメニュー（A/B比較/リネーム/カット/コピー/複製/削除対応）。PSD選択時は非PSD選択をクリア、逆も同様
  - サムネイル選択: 水色の太枠（12px box-shadow）で表示。チェックマーク廃止。サムネイル間余白3倍化。リスト表示も水色（bg-sky-100）
  - 選択ファイル自動スクロール: サムネイル（PreviewGrid useEffect + scrollIntoView）/ リスト（PsdFileListView useEffect + data-file-id）
  - リスト表示複数選択: Shift+クリックで範囲選択（selectRange）、Ctrl+クリックで個別トグル
  - 折りたたみトグル: 全セクション（MetadataPanel/GuideSectionPanel/FolderBreadcrumbTree）のシェブロンアイコンを右側に配置
  - 左サイドバー構成: 原稿仕様（ガイド線+カラーモード/ビット深度/αチャンネル/キャンバスサイズ/トンボ）+ レイヤー（LayerSectionPanel、デフォルト閉じ）
  - リロード: psdStoreのrefreshCounter + triggerRefresh()でfolderContents強制更新
  - ビューアー連動: 拡大表示中のファイル→ビューアー切替時に同じファイルを自動表示
  - （※ v3.8.2 でコンテンツロック機能は削除済 — アドレス変更・D&D 時は常に最新のファイルリストに追従）
  - メイン画面でtxt/jsonクリック: txtは右プレビューに表示、jsonは校正JSON/作品情報として自動判定して読み込み
  - MetadataPanel: 各セクション折りたたみ可能。テキストのみ表示チェック
  - PSDフィルタ / PDF表示切替（ページごと/ファイル単位）/ ソート（名前/サイズ/DPI/チェック結果）
  - **フローティングボタン（v3.7.0）**: PDF化（filteredFiles対応）/ 簡易スキャン（SpecScanJsonDialog、フィルタ対象のみ、JSON保存後にフォントプリセット自動読込）/ テキスト抽出（filteredFiles対応、抽出後textPages自動パース）
  - 対応ファイル表示: PSD/PSB/JPG/PNG/TIFF/BMP/GIF/PDF/EPS + TXT/JSON + フォルダのみ（それ以外は非表示）
  - PDF表示: `FilePreviewImage`でpdfPageIndex/pdfSourcePathを`useHighResPreview`に渡し、`get_pdf_preview`（PDFium）でレンダリング
- **TypsettingView**: 写植関連（隔離中 — ViewRouterでマウント無効化、ドットメニューから除外。削除予定）
- **ReplaceView**: レイヤー差替え
- **ComposeView**: 合成（2カラム: ComposePanel | ComposeDropZone）。Replace機能と類似のペアリングUI
- **SplitView**: 見開き分割
- **RenameView**: リネーム（レイヤーリネーム / ファイルリネーム）
- **TiffView**: TIFF化（3カラム: TiffSettingsPanel | TiffFileList | Center(プレビュー/一覧/ビューアータブ切替)）。TiffFileListヘッダーとTiffBatchQueueヘッダーにサブフォルダチェックを配置
- **ScanPsdView（v3.9.0改修）**: モード選択後は **常に `ScanPsdEditView`**（3カラム全画面: 作品情報 / フォント種類等 / サイズ統計）で表示。旧2カラム split layout（ScanPsdPanel + ScanPsdContent）は撤去（ファイルは残存）。追加スキャン/巻数管理/保存はヘッダー右の固定ボタンから。JSON編集時に未登録フォントアラート表示。フォント帳を独立セクションとして追加（モーダル表示）
- **(KenbanView 削除済み)** — v3.5.0で差分・分割ビューアーをReactネイティブ移植完了
- **ProgenView**: React画面ルーター。progenStore.screenで6画面切替。viewStore.progenModeから自動初期化。状態保持型マウント（display切替）
- **UnifiedViewerView**: 統合ビューアー + 差分モード + 分割ビューアーの3タブ。統合ビューアーは3カラム（全タブ共通パネル）。unifiedViewerStore独立管理。psdStoreとdoSync+loadImageRefで自動同期。PDF表示はpdf.jsで描画（isPdf/pdfPath/pdfPageを正しくマッピング）

### レイヤーツリー (LayerPreviewPanel)
- **タブ切替**: 「レイヤー構造」（デフォルト）/ 「ビューアー」のセグメントボタン
- **レイヤー構造モード**:
  - 表示順: ag-psdのbottom-to-topを`.reverse()`でPhotoshop表示順（上がforeground）に変換
  - マルチカラムグリッド: 最大3列、4ファイル以上は次の行へ。CSS Gridで同一行の高さを揃え
  - サイドバー連動: selectedFileIdsがあればそのファイルのみ、なければ全ファイル表示
  - ローカル複数選択: クリックで単一選択、Shift+クリックで複数選択。チェック済みファイルはPhotoshop Blue (#31A8FF)でハイライト
  - Pキー: チェック済みファイルをPhotoshopで一括起動（単一ファイル時はそのまま起動）
  - モード連動: actionMode (hide/show) に応じて willChange / 済 / 要確認 をバッジ表示
  - リスク分類: layerMatcher.ts で safe/warning/none を判定。ラスターレイヤーの誤非表示をwarning表示
- **ビューアーモード**:
  - 全ファイル対象の高解像度プレビュー（useHighResPreview, maxSize=2000）
  - ナビゲーション: 矢印キー/マウスホイール/矢印ボタン（端でクランプ、循環なし）
  - サイドバー選択変更時にビューアー位置を同期
  - P/Fショートカット: キャプチャフェーズ(`addEventListener(..., true)`)で現在表示中ファイルに対応（グローバルハンドラーより優先）
- **select-none**: テキスト選択防止（全インタラクティブリストコンテナに適用）

### UIフロー
```
1. ファイル読み込み（D&D or フォルダ選択）
         ↓
2. 仕様選択モーダル表示
   - 自動選択有効 & 前回選択あり → 自動でチェック開始
   - そうでなければモーダル表示
         ↓
3. モノクロ/カラー選択 → 自動チェック実行
         ↓
4. OK/NG結果をサムネイル・Toolbarに表示
         ↓
5. NGファイル選択 → 修正ガイド表示
         ↓
6. 「変換」ボタン → Photoshopで一括修正
```

## ディレクトリ構造

```
src/
├── main.tsx               # Reactエントリポイント（StrictMode + AppLayout）
├── App.tsx                # ルートコンポーネント
├── components/
│   ├── common/            # 共通コンポーネント
│   │   ├── CompactFileList.tsx    # コンパクトファイル一覧
│   │   ├── DetailSlidePanel.tsx   # スライドイン詳細パネル
│   │   ├── FileContextMenu.tsx   # 右クリックコンテキストメニュー（ファイル操作/編集/読み込み）
│   │   └── TextExtractButton.tsx  # テキスト抽出フローティングボタン（COMIC-POT互換出力）
│   ├── file-browser/      # ファイル選択・ドロップゾーン
│   │   ├── DropZone.tsx          # UI表示のみ（D&DリスナーはuseGlobalDragDrop）
│   │   ├── FileBrowser.tsx       # フォルダ/ファイル選択ハンドラー
│   │   └── FileList.tsx          # ファイルリスト表示（選択/マルチセレクト）
│   ├── layout/            # レイアウトコンポーネント
│   │   ├── AppLayout.tsx         # メインレイアウト（TopNav + GlobalAddressBar + ViewRouter）
│   │   ├── GlobalAddressBar.tsx  # グローバルアドレスバー（全タブ共通）
│   │   ├── TopNav.tsx            # 上部ナビゲーション（タブ切替）
│   │   ├── ViewRouter.tsx        # ビュー切替ルーター
│   │   ├── WorkflowBar.tsx       # ワークフローナビゲーション（4ワークフロー、ステップ進行UI）
│   │   └── SettingsPanel.tsx     # 設定画面（文字サイズ/カラー/ダークモード/デフォルトフォルダ）
│   ├── unified-viewer/   # 統合ビューアー
│   │   ├── UnifiedViewer.tsx          # メインコンポーネント（3カラムレイアウト、画像ビューアー、renderTabContent）
│   │   ├── utils.ts                   # ヘルパー関数・定数（COMIC-POTパーサー、ページ番号計算、ファイル判定）
│   │   ├── UnifiedSubComponents.tsx   # サブコンポーネント（ToolBtn, PanelTabBtn, LayerTreeView, SortableBlockItem, UnifiedDiffDisplay, CheckJsonBrowser）
│   │   ├── useViewerFileOps.ts        # ファイル操作フック（openFolder, openTextFile, handleJsonFileSelect, handleSave, handleSaveAs）
│   │   └── ProgenImageViewer.tsx      # ProGen画像ビューアー（React製、COMIC-POTスタイル）
│   ├── diff-viewer/      # 差分ビューアー（v3.5.0でKENBANから移植）
│   │   └── DiffViewerView.tsx    # 比較モード/表示モード/ペアリング/差分計算
│   ├── parallel-viewer/  # 分割ビューアー（v3.5.0でKENBANから移植）
│   │   └── ParallelViewerView.tsx # 2パネル独立/同期切替/PDF見開き分割
│   ├── views/             # ビューコンポーネント
│   │   ├── FileView.tsx          # （未使用 — SpecCheckViewに統合済み）
│   │   ├── FontBookView.tsx      # フォント帳ビュー（画像添付: ファイル選択/D&D、v3.7.1復元）
│   │   ├── LayerControlView.tsx  # レイヤー制御ビュー
│   │   ├── SpecCheckView.tsx     # 仕様チェックビュー（サムネイル/レイヤー/写植タブ切替）
│   │   ├── TypsettingView.tsx    # 写植関連ビュー（写植チェック・確認を統合）
│   │   ├── ViewerView.tsx        # ビューアービュー（SpecViewerPanel再利用）
│   │   ├── ReplaceView.tsx       # レイヤー差替えビュー
│   │   ├── ComposeView.tsx      # 合成ビュー（ComposePanel + ComposeDropZone）
│   │   ├── SplitView.tsx         # 見開き分割ビュー
│   │   ├── RenameView.tsx        # リネームビュー（fileEntries→psdStore自動同期）
│   │   ├── TiffView.tsx          # TIFF化ビュー（3カラム: FileList|Center|Settings）
│   │   ├── ScanPsdView.tsx      # Scan PSDビュー（v3.9.0: モード選択後は常にScanPsdEditView全画面）
│   │   ├── FolderSetupView.tsx  # フォルダセットアップ（原稿コピー+構造作成）
│   │   ├── RequestPrepView.tsx  # 依頼準備（ZIP圧縮、3モード、内容チェック）
│   │   # KenbanView.tsx 削除済み（v3.5.0）
│   │   ├── ProgenView.tsx       # ProGen画面ルーター（React native、6画面切替）
│   │   ├── UnifiedViewerView.tsx # 統合ビューアー（v3.9.0: 単一画面、サブタブ撤去）
│   │   └── InspectionToolView.tsx # 検版ツール（v3.9.0新設: 差分モード/分割ビューアー2サブタブ）
│   ├── metadata/          # メタデータ表示
│   │   ├── MetadataPanel.tsx
│   │   └── LayerTree.tsx
│   ├── preview/           # プレビュー
│   │   ├── PreviewGrid.tsx
│   │   ├── PreviewList.tsx        # リスト形式プレビュー（サムネイル+メタデータ）
│   │   └── ThumbnailCard.tsx
│   ├── spec-checker/      # 仕様チェック
│   │   ├── CaptureOverlay.tsx    # キャプチャオーバーレイ
│   │   ├── ConversionToast.tsx
│   │   ├── FixGuidePanel.tsx
│   │   ├── FontBrowserDialog.tsx # フォントブラウザダイアログ
│   │   ├── GuideSectionPanel.tsx
│   │   ├── LayerSeparationPanel.tsx # レイヤー分離パネル
│   │   ├── SpecCardList.tsx     # チェック結果カードリスト（マルチセレクト対応）
│   │   ├── SpecCheckTable.tsx    # 仕様チェック結果テーブル
│   │   ├── SpecCheckerPanel.tsx
│   │   ├── SpecLayerGrid.tsx     # レイヤー構造グリッド（全ファイル一覧）
│   │   ├── SpecScanJsonDialog.tsx # スキャンJSONダイアログ
│   │   ├── SpecSelectionModal.tsx
│   │   ├── SpecTextGrid.tsx      # 写植仕様グリッド（フォント/サイズ統計 + テキストレイヤー一覧）
│   │   └── SpecViewerPanel.tsx   # ビューアーパネル（画像+サイドバー、全画面対応）
│   ├── guide-editor/      # ガイド線編集
│   │   ├── GuideEditorModal.tsx
│   │   ├── GuideCanvas.tsx
│   │   ├── CanvasRuler.tsx
│   │   └── GuideList.tsx          # ガイド一覧（位置編集/削除）
│   ├── layer-control/     # レイヤー制御
│   │   ├── LayerControlPanel.tsx        # 条件指定UIと実行ボタン
│   │   ├── LayerPreviewPanel.tsx        # レイヤーツリープレビュー（グリッド・選択・Ps連携）
│   │   └── LayerControlResultDialog.tsx # 処理結果レポートダイアログ
│   ├── replace/           # レイヤー差替え
│   │   ├── ReplacePanel.tsx
│   │   ├── ReplaceDropZone.tsx
│   │   ├── ReplacePairingModal.tsx      # ペアリング確認ダイアログ（タブ切替シェル）
│   │   ├── PairingAutoTab.tsx           # 自動ペアリングタブ（チェック/編集/解除付きテーブル）
│   │   ├── PairingManualTab.tsx         # 手動マッチタブ（2カラム+クリック/ドラッグ）
│   │   ├── PairingOutputSettings.tsx    # 出力設定（保存ファイル名・フォルダ名）
│   │   └── ReplaceToast.tsx
│   ├── compose/           # 合成
│   │   ├── ComposePanel.tsx             # 合成設定パネル（要素選択・ペアリング方式）
│   │   ├── ComposeDropZone.tsx          # Source A/B ドロップゾーン
│   │   ├── ComposePairingModal.tsx      # ペアリング確認ダイアログ（タブ切替シェル）
│   │   ├── ComposePairingAutoTab.tsx    # 自動ペアリングタブ
│   │   ├── ComposePairingManualTab.tsx  # 手動マッチタブ
│   │   ├── ComposePairingOutputSettings.tsx # 出力設定
│   │   └── ComposeToast.tsx             # 合成完了トースト通知
│   ├── split/             # 見開き分割
│   │   ├── SplitPanel.tsx
│   │   ├── SplitPreview.tsx       # 定規ドラッグ・ガイド操作・ズーム/パン
│   │   └── SplitResultDialog.tsx  # 分割処理結果ダイアログ
│   ├── rename/            # リネーム
│   │   ├── LayerRenamePanel.tsx   # レイヤーリネーム設定UI
│   │   ├── FileRenamePanel.tsx    # ファイルリネーム設定UI
│   │   ├── RenamePreview.tsx      # プレビュー表示（両モード共通）
│   │   └── RenameResultDialog.tsx # 処理結果ダイアログ
│   ├── tiff/              # TIFF化
│   │   ├── TiffAutoScanDialog.tsx       # 自動スキャンダイアログ
│   │   ├── TiffBatchQueue.tsx           # バッチキュー＋個別上書き＋リネームプレビュー＋サブフォルダチェック
│   │   ├── TiffCanvasMismatchDialog.tsx # キャンバスサイズ不一致ダイアログ
│   │   ├── TiffCropEditor.tsx           # ビジュアルクロップエディタ（ドラッグ矩形・savedGlobalBoundsRefで個別編集後グローバル復元）
│   │   ├── TiffCropSidePanel.tsx        # クロップ設定サイドパネル（比率OK/サイズ/PSD自動設定のみ表示、手入力廃止）
│   │   ├── TiffFileList.tsx             # 中央ファイルリスト（スキップ切替・個別設定・サブフォルダチェック）
│   │   ├── TiffPageRulesEditor.tsx      # ページ別カラー設定
│   │   ├── TiffPartialBlurModal.tsx     # 部分ぼかし設定モーダル（ファイル別モード時は空リスト開始）
│   │   ├── TiffResultDialog.tsx         # 処理結果ダイアログ
│   │   ├── TiffSettingsPanel.tsx        # 左パネル設定UI（折りたたみセクション: 出力形式/カラーぼかし/クロップ・リサイズ/リネーム・出力先）
│   │   └── TiffViewerPanel.tsx          # TIFF化ビューアーパネル（プレビュー表示）
│   ├── scanPsd/           # Scan PSD（フォントプリセット管理）
│   │   ├── ScanPsdPanel.tsx          # 左パネル（5タブ + 保存ボタン）
│   │   ├── ScanPsdContent.tsx        # 右パネル（モード選択/スキャンUI/サマリー/ファイルブラウザ）
│   │   ├── ScanPsdEditView.tsx       # JSON編集ビュー
│   │   ├── ScanPsdModeSelector.tsx   # モード選択カード（新規/編集）
│   │   ├── JsonFileBrowser.tsx       # basePath以下のJSON専用ファイルブラウザ
│   │   └── tabs/
│   │       ├── WorkInfoTab.tsx       # タブ0: 作品情報（ジャンル/レーベル/著者/タイトル等）
│   │       ├── FontTypesTab.tsx      # タブ1: フォント種類（プリセットセット管理）
│   │       ├── FontSizesTab.tsx      # タブ2: フォントサイズ統計
│   │       ├── GuideLinesTab.tsx     # タブ3: ガイド線（選択/除外）
│   │       └── TextRubyTab.tsx       # タブ4: テキスト/ルビ
│   ├── progen/            # ProGen（React統合済み、iframe廃止）
│   │   ├── ProgenRuleView.tsx            # ルール編集（6カテゴリ+Gemini）
│   │   ├── ProgenProofreadingView.tsx    # 校正チェック（正誤/提案）
│   │   ├── ProgenJsonBrowser.tsx         # GドライブJSONブラウザ
│   │   ├── ProgenResultViewer.tsx        # 校正結果ビューア（3タブ+ピックアップ）
│   │   ├── ProgenCalibrationSave.tsx     # 校正データ保存（TXTフォルダ選択）
│   │   ├── ProgenAdminView.tsx           # パスワード付き管理画面
│   │   └── comicpot/
│   │       ├── ComicPotEditor.tsx        # COMIC-POTテキストエディタ
│   │       └── ComicPotChunkList.tsx     # チャンク表示+D&D
│   ├── typesetting-confirm/ # 写植確認
│   │   └── TypesettingConfirmPanel.tsx  # フォント指定・テキスト保存・ビューアー連動
│   ├── ErrorBoundary.tsx  # Reactエラーバウンダリ（ViewRouterに適用）
│   └── ui/                # 共通UIコンポーネント
│       ├── index.ts              # バレルエクスポート
│       ├── Badge.tsx             # ステータスバッジ（rgb/grayscale/success/error/warning/pink/purple/mint）
│       ├── GlowCard.tsx          # グロー効果カード（hover時、selected/glowColor指定可）
│       ├── Modal.tsx             # モーダルダイアログ
│       ├── PopButton.tsx         # ポップオーバーボタン
│       ├── ProgressBar.tsx       # プログレスバー（success/warning/animated）
│       ├── SpeechBubble.tsx      # 吹き出し（success/warning/error/info、尾位置指定）
│       └── Tooltip.tsx           # ホバーツールチップ（top/bottom/left/right、遅延指定）
├── hooks/
│   ├── useAppUpdater.ts          # アプリ更新管理（Tauri Updaterプラグイン）
│   ├── useCanvasSizeCheck.ts     # キャンバスサイズ検証（多数派検出・外れ値フラグ）
│   ├── useComposeProcessor.ts    # 合成処理（スキャン＆ペアリング・PS実行）
│   ├── useCropEditorKeyboard.ts  # クロップエディタキーボード操作（Tachimi互換）
│   ├── useFileWatcher.ts         # ファイル変更監視（外部変更検出）
│   ├── useFontResolver.ts        # フォント名解決（PostScript名→表示名・色マッピング・未インストール検出）
│   ├── useGlobalDragDrop.ts      # グローバルD&Dリスナー（AppLayoutで常時有効、フォルダのみD&D時はloadFolderで更新）
│   ├── useHandoff.ts             # ハンドオフ機能（外部ツール連携）
│   ├── useHighResPreview.ts      # 高解像度プレビュー（3層キャッシュ）
│   ├── useLayerControl.ts        # レイヤー制御（hide/show/custom/organize/layerMove）
│   ├── useOpenFolder.ts          # エクスプローラー表示（openFolderForFile / revealFiles）+ Fキーショートカット
│   ├── useOpenInPhotoshop.ts     # Photoshopファイル起動（ユーティリティ + Pキーショートカット）
│   ├── usePageNumberCheck.ts     # ページ番号検出（ファイル名から連番抽出・欠番検出）
│   ├── usePhotoshopConverter.ts  # Photoshop経由仕様変換（DPI/カラー/ビット深度）
│   ├── usePreparePsd.ts          # PSD準備（仕様修正+ガイド適用の統合処理）
│   ├── usePsdLoader.ts           # PSD読み込み・自然順ソート・PDF展開
│   ├── useRenameProcessor.ts     # リネーム処理（ファイル/レイヤー）
│   ├── useReplaceProcessor.ts    # レイヤー差替え処理
│   ├── useScanPsdProcessor.ts    # Scan PSD処理（スキャン・JSON保存/読込・ガイド自動選択）
│   ├── useSpecChecker.ts         # 仕様チェック（自動実行・結果キャッシュ）
│   ├── useTextExtract.ts         # テキスト抽出ロジック共有フック（COMIC-POT互換出力）
│   ├── useSpecConverter.ts       # 直接仕様変換（ag-psd+Rust、Photoshop不要）
│   ├── useSplitProcessor.ts      # 見開き分割処理
│   ├── useTiffProcessor.ts       # TIFF化処理（設定マージ・invoke・結果処理）
│   ├── useProgenTauri.ts         # ProGen 26コマンドのinvokeラッパー
│   ├── useProgenJson.ts          # ProGen JSON読み書き+CSV解析+カテゴリグループ化
│   └── useComicPotState.ts       # COMIC-POTエディタ専用useReducerステート
├── lib/
│   ├── psd/
│   │   └── parser.ts            # ag-psdラッパー、メタデータ抽出
│   ├── agPsdScanner.ts          # ag-psdスキャナー（PSDメタデータ一括収集）
│   ├── layerMatcher.ts          # レイヤーマッチング・リスク分類（共有ロジック）+ 差替え対象マッチング
│   ├── layerTreeOps.ts          # レイヤーツリー操作ユーティリティ
│   ├── psdLoaderRegistry.ts     # グローバルPSDローダーレジストリ（WorkflowBar等のReact外からloadFolder/loadFiles呼び出し用）
│   ├── naturalSort.ts           # 自然順ソート（数字部分を数値比較）
│   ├── paperSize.ts             # 用紙サイズ判定（ピクセル+DPI→B4/A4等）
│   ├── textUtils.ts             # テキスト処理ユーティリティ
│   └── progenPrompts.ts         # ProGen XMLプロンプトテンプレート（正誤/提案チェック）
├── store/
│   ├── index.ts           # バレルエクスポート（psdStore, guideStore, specStore）
│   ├── psdStore.ts        # ファイル一覧・選択状態（files, selectedFileIds, activeFileId, viewMode）
│   ├── specStore.ts       # 仕様・チェック結果（specifications, checkResults, autoCheckEnabled）。localStorage永続化
│   ├── guideStore.ts      # ガイド線状態（guides, history/future, selectedGuideIndex）
│   ├── layerStore.ts      # レイヤー制御: actionMode(hide/show/custom/organize/layerMove), saveMode, selectedConditions, customConditions, organizeTargetName, layerMove条件, deleteHiddenText, customVisibilityOps/customMoveOps（カスタム操作Map）
│   ├── viewStore.ts       # ビュー切替状態（activeView: AppView, progenMode: ProgenMode）
│   ├── settingsStore.ts   # アプリ設定（文字サイズ/カラー/ダークモード/デフォルトフォルダ、localStorage永続化）
│   ├── fontBookStore.ts   # フォント帳（entries, fontBookDir, isLoaded）
│   ├── splitStore.ts      # 分割設定（settings, selectionHistory/Future）
│   ├── replaceStore.ts    # 差替え設定（folders, batchFolders, settings, pairingJobs, manualPairs, excludedPairIndices）
│   ├── composeStore.ts    # 合成設定（folders, settings, pairingJobs, scannedFileGroups, manualPairs）
│   ├── renameStore.ts     # リネーム設定（subMode, layerSettings, fileSettings, fileEntries）
│   ├── tiffStore.ts       # TIFF化設定・状態（settings, fileOverrides, cropPresets, cropGuides, phase, results）。localStorage永続化（crop.bounds除く）
│   ├── scanPsdStore.ts    # Scan PSD（mode, scanData, presetSets, workInfo, guide選択/除外, パス設定）。パスのみlocalStorage永続化
│   ├── progenStore.ts     # ProGen全状態（40+プロパティ、ルール管理、マスタールール読み込み、JSONルール適用、resultSaveMode）
│   ├── diffStore.ts       # 差分ビューアー（v3.5.0、ペアリング/比較モード/差分計算）
│   ├── parallelStore.ts   # 分割ビューアー（v3.5.0、2パネル独立/同期切替/PDF展開）
│   ├── typesettingCheckStore.ts  # 写植チェック（checkData, checkTabMode, searchQuery, navigateToPage）
│   ├── workflowStore.ts   # WF状態（v3.6.5、activeWorkflow/currentStep + WORKFLOWS定数）
│   └── unifiedViewerStore.ts    # 統合ビューアー（独立ファイル管理、テキスト、校正JSON、フォントプリセット、PanelTab + 4ポジションパネル配置、displacedTabs入れ替え記憶）
├── styles/
│   └── globals.css
├── kenban-utils/         # 旧KENBAN由来の共有ユーティリティ（統合ビューアーで使用中）
│   ├── textExtract.ts   # LCS文字レベルdiff、テキスト抽出
│   ├── memoParser.ts    # COMIC-POT等のメモ解析
│   └── kenbanTypes.ts   # ExtractedTextLayer, DiffPart等の型定義
└── types/
    ├── index.ts           # PsdFile, PsdMetadata, LayerNode, TextInfo, Specification, SpecRule, SpecCheckResult, IMAGE_EXTENSIONS等
    ├── fontBook.ts        # FontBookEntry, FontBookData, FontBookParams
    ├── replace.ts         # ReplaceSettings, PairingJob, FolderSelection, BatchFolder等
    ├── rename.ts          # RenameSubMode, RenameRule, FileRenameEntry等
    ├── tiff.ts            # TiffSettings, TiffCropBounds, TiffCropPreset, TiffScandataFile等
    ├── progen.ts          # SymbolRule, ProofRule, ProgenOptions, NumberRuleState, EditCategory, ProgenScreen等
    ├── scanPsd.ts         # ScanData, PresetJsonData, ScanGuideSet, ScanWorkInfo, FontPreset, GENRE_LABELS, FONT_SUB_NAME_MAP等
    └── typesettingCheck.ts # ProofreadingCheckData, CheckItem, CheckKind等

public/
├── (progen/ 削除済み — React統合完了)
├── pdfjs-wasm/          # PDF.js WASM（KENBAN用）

src-tauri/
├── scripts/
│   ├── apply_guides.jsx       # ガイド線適用
│   ├── convert_psd.jsx        # 仕様変換（DPI/カラーモード/ビット深度/αチャンネル削除）
│   ├── custom_operations.jsx  # カスタム操作（個別表示/非表示・移動・非表示テキスト削除）
│   ├── hide_layers.jsx        # レイヤー表示/非表示
│   ├── lock_layers.jsx        # レイヤーロック/アンロック
│   ├── merge_layers.jsx       # レイヤー結合
│   ├── move_layers.jsx        # レイヤー整理（条件ベースのレイヤー移動）
│   ├── organize_layers.jsx    # フォルダ格納（グループ再構成）
│   ├── prepare_psd.jsx        # PSD準備（仕様修正+ガイド適用の統合処理）
│   ├── rename_psd.jsx         # レイヤーリネーム
│   ├── replace_layers.jsx     # レイヤー差替え＋合成処理
│   ├── scan_psd.jsx           # PSDスキャン（レガシー、元スクリプト全機能）
│   ├── scan_psd_core.jsx      # PSDスキャン（コア処理のみ、UI無し）
│   ├── split_psd.jsx          # 見開き分割
│   └── tiff_convert.jsx       # TIFF化（テキスト整理・カラー変換・ぼかし・クロップ・リサイズ）
├── resources/
│   └── pdfium/
│       └── pdfium.dll         # PDFiumバイナリ（.gitignore管理、別途DL）
├── Cargo.toml             # Rust依存関係（pdfium-render, fontdb, tokio, serde等）
├── tauri.conf.json        # Tauri設定（ウィンドウ、プラグイン、セキュリティ）
├── build.rs               # ビルドスクリプト
└── src/
    ├── main.rs            # Tauriエントリポイント
    ├── lib.rs             # コマンド登録（invoke_handler）
    ├── commands.rs        # 全Tauriコマンド
    ├── pdf.rs             # PDFレンダリング内部ヘルパー（pdfium-render）
    ├── psd_metadata.rs    # PSDメタデータ抽出ユーティリティ
    ├── watcher.rs         # ファイル変更監視（外部ファイル変更検出）
    ├── kenban.rs          # KENBANバックエンド（21コマンド）
    └── progen.rs          # ProGenバックエンド（26コマンド）
```

## 重要な型定義

```typescript
// 対応ファイル形式 (types/index.ts)
const IMAGE_EXTENSIONS = [".psd", ".psb", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".pdf", ".gif", ".eps"];
const PSD_EXTENSIONS = [".psd", ".psb"];  // ag-psdでパース可能なもの
// isSupportedFile(fileName) / isPsdFile(fileName) / isPdfFile(fileName) ヘルパー関数あり

// PsdFile PDF関連フィールド（PDFページ展開時に設定）
interface PsdFile {
  // ... 既存フィールド ...
  sourceType?: "psd" | "image" | "pdf";  // ファイル種別
  pdfSourcePath?: string;                // PDF元ファイルパス
  pdfPageIndex?: number;                 // 0-based ページ番号
}

// PSDメタデータ
interface PsdMetadata {
  width: number;
  height: number;
  dpi: number;
  colorMode: ColorMode;
  bitsPerChannel: number;
  hasGuides: boolean;
  guides: Guide[];
  layerCount: number;
  layerTree: LayerNode[];
  hasAlphaChannels: boolean;
  alphaChannelCount: number;
  alphaChannelNames: string[];
}

// レイヤーノード
interface LayerNode {
  id: string;
  name: string;
  type: "layer" | "group" | "text" | "adjustment" | "smartObject" | "shape";
  visible: boolean;
  opacity: number;
  blendMode: string;
  hasMask?: boolean;        // レイヤーマスク（ag-psd: mask/realMask）
  hasVectorMask?: boolean;  // ベクトルマスク（ag-psd: vectorMask）
  clipping?: boolean;       // クリッピングマスク（ag-psd: clipping）
  textInfo?: TextInfo;      // テキストレイヤーのフォント・サイズ情報
  children?: LayerNode[];
}

// テキスト情報（parser.tsで抽出、ag-psd text.style/styleRunsから）
interface TextInfo {
  text: string;
  fonts: string[];       // PostScript名（例: "KozMinPr6N-Regular"）
  fontSizes: number[];   // ポイント数（DPI正規化済み: fontSize * 72/dpi）
}

// 仕様定義
interface Specification {
  id: string;
  name: string;
  enabled: boolean;
  rules: SpecRule[];
}

// チェックルール
interface SpecRule {
  type: "colorMode" | "dpi" | "bitsPerChannel" | "hasAlphaChannels" | ...;
  operator: "equals" | "greaterThan" | "lessThan" | ...;
  value: string | number | boolean;
  message: string;
}

// チェック結果
interface SpecCheckResult {
  fileId: string;
  passed: boolean;
  results: { rule: SpecRule; passed: boolean; actualValue: any }[];
  matchedSpec?: string;
}
```

## 自動チェックの実装ポイント

- **仕様チェックはSpecCheckViewでのみ実行**: `useSpecChecker()`は`SpecCheckView`内で呼び出す（`AppLayout`からは除外）。他タブでは自動チェックが走らない

```typescript
// useSpecChecker.ts
// 重要: files.lengthではなくfilesWithMetadataCountを監視する
// PSD読み込みは非同期でメタデータが後から追加されるため
const filesWithMetadataCount = files.filter((f) => f.metadata).length;

useEffect(() => {
  const specChanged = activeSpecId !== prevActiveSpecIdRef.current;
  const metadataAdded = filesWithMetadataCount > prevFilesWithMetadataRef.current;

  if (activeSpecId && filesWithMetadataCount > 0 && (specChanged || metadataAdded)) {
    checkAllFiles(enabledSpecs);
  }
}, [activeSpecId, filesWithMetadataCount, ...]);
```

## Photoshop JSX連携の注意点

1. **設定ファイルの受け渡し**: `Folder.temp` にJSONファイルを配置
2. **UTF-8 BOM**: 日本語パス対応のため `0xEF, 0xBB, 0xBF` を先頭に付与
3. **パス変換**: Windows `\\` → `/` に変換（JSX互換性）
4. **JSON処理**: ExtendScriptにはネイティブJSONがないため自作パーサーを使用
5. **DPIリサンプリング**: `ResampleMethod.BICUBIC` で実際のピクセル処理
6. **結果パスの正規化**: JSXからの結果パスは `/` 区切り → フロントでの比較時に `\` へ正規化が必要（各processorフックで`.replace(/\//g, "\\")`）
7. **ウィンドウ前面化**: 処理完了後に `window.set_focus()` でアプリを前面に復帰（全Photoshop連携コマンド）
8. **Zustandのstale closure回避**: `useCallback`内で最新のstoreデータが必要な場合は`usePsdStore.getState().files`を使用（`files`をdepsに入れると古い値が参照される）
9. **Tauri D&D座標のDPR補正**: `onDragDropEvent`は物理ピクセル座標を返すが`getBoundingClientRect()`はCSS座標。`pos.x / window.devicePixelRatio`で補正が必要（Windows 150%スケーリング等）
10. **`<button>`は`<label>`のlabelable要素**: `<button>`を`<label>`内に配置するとクリック時に二重トグルが発生する。カスタムCheckBoxには`<div role="checkbox">`を使用
11. **JSX詳細レポート（差替え）**: `result.changes`に`"  → レイヤー「name」"`/`"  → グループ「name」"`/`"  → テキストフォルダ「name」"`形式で個別マッチを記録。フロント側`extractMatchedNames()`で正規表現パース
12. **JSX詳細レポート（レイヤー制御）**: `changedNames`に`"テキスト「name」∈「parent」"`形式で親フォルダ情報付きで記録。フロント側`extractMatchedItems()`→`buildTree()`でツリー構築。親フォルダが結果に含まれない場合はコンテキストとして`グループ`ノード（G）を自動生成
13. **Photoshopスクリプト実行パターン**: 基本は「直接パス + `.output()` + ポーリング」。ただし`split_psd`と`tiff_convert`は処理時間が長いため「temp copy + `.spawn()` + ポーリング」を使用（`.output()`はPS実行中ブロックするため）
14. **非PSDファイルの読み込み**: `isPsdFile()`で判定し、PSD以外は`stat()`でファイルサイズのみ取得。ag-psdパースはスキップ。Photoshopが開ける前提でファイル一覧に表示
15. **ExtendScript `File.name` のURI符号化**: `File.name`は非ASCII文字をURIエンコードして返す（例: `校正_堀川` → `%E6%A0%A1%E6%AD%A3_%E5%A0%80%E5%B7%9D`）。`decodeURI(file.name)`で正しいファイル名を取得すること
16. **PDF分割処理**: JSX側で`pdfPageIndex >= 0`の場合、`PDFOpenOptions`（`page`, `resolution: 600`, `mode: OpenDocumentMode.RGB`）でページ指定オープン。`fileInfos`は`{ path, pdfPageIndex }`形式で渡す（`pdfPageIndex: -1`は通常ファイル）
17. **ExtendScript Document比較**: `sourceDoc === targetDoc` は異なるDocumentオブジェクトでも`true`を返すことがある。**Documentオブジェクトの`===`比較は使わず、文字列ラベル（"A"/"B"）で比較すること**（合成モードの要素ルーティングで発生したバグ）

## フォント名解決（Rust側）

`resolve_font_names` コマンド: PostScript名からシステムフォントの表示名・スタイル名を解決
- `fontdb::Database` でシステムフォントをロード（`OnceLock`でキャッシュ）
- 日本語名優先（`Language::Japanese_Japan`）
- サブファミリー名: `ttf_parser` で OpenType name table から ID 17 (Typographic Subfamily) → ID 2 (Subfamily) の優先順で抽出。日本語ロケール (0x0411) > 英語 (0x0409) > その他
- フロント: `useFontResolver` フックが `invoke("resolve_font_names")` で一括解決。フォント色パレット割当、未インストール検出も管理

`search_font_names` コマンド: フォント名で部分一致検索（手動フォント追加用）
- PostScript名・表示名の両方を対象にcase-insensitive部分一致
- 最大30件まで返却（`FontNameSearchResult`: `postscript_name`, `display_name`, `style_name`）
- FontTypesTabの手動フォント追加フォームから使用

## 高速PSD読み込み（Rust側）

tachimi_standaloneから移植した高速PSD読み込み機能:

1. **直接Image Data読み込み**: レイヤー解析をスキップして合成画像のみ取得
2. **RLE/PackBits圧縮デコード**: PSD独自の圧縮形式を直接デコード
3. **PSDキャッシュ**: `OnceLock<Mutex<HashMap>>` で最大10エントリをキャッシュ
4. **非同期処理**: `tokio::task::spawn_blocking` でUIフリーズ防止
5. **高速リサイズ**: `FilterType::CatmullRom`（Lanczos3より高速）
6. **asset://プロトコル**: `convertFileSrc()` でファイルパスをURLに変換

```rust
// commands.rs - 高速PSD読み込みの流れ
load_psd_fast(path)
  → load_psd_composite(path)  // 直接Image Dataセクション読み込み
  → 失敗時: psd crateにフォールバック
```

## PDFレンダリング（Rust側）

pdfium-renderによるPDFプレビュー/サムネイル生成:

1. **PDFium DLL**: `src-tauri/resources/pdfium/pdfium.dll`から遅延ロード（`OnceLock<Pdfium>`でシングルトン管理）
2. **DLL探索順**: リソースディレクトリ → `CARGO_MANIFEST_DIR/resources/` → システムPATH
3. **Tauriコマンド**: `get_pdf_info`（ページ数・寸法）、`get_pdf_preview`（高解像度）、`get_pdf_thumbnail`（Base64サムネイル）
4. **ページ展開**: PDFドロップ時に`get_pdf_info`で全ページ情報取得 → `psdStore.replaceFile()`で1ファイルを複数ページエントリーに置換
5. **キャッシュ**: ディスクキャッシュ `manga_pdf_preview_{name}_{mtime}_{page}_{size}.jpg`（既存PSDキャッシュと同一パターン）
6. **pdfium-render API注意**: ページインデックスは`u16`型（`PdfPageIndex`）、`PdfPoints`は`.value: f32`、`as_image()`は`DynamicImage`を直接返す

## Rustコマンド一覧（commands.rs — 55コマンド、kenban.rs — 21コマンド、progen.rs — 26コマンド、合計102コマンド）

### Photoshop連携
| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `check_photoshop_installed` | — | `serde_json::Value` | Photoshopインストール確認 |
| `run_photoshop_conversion` | `settings: PhotoshopConversionSettings` | `Vec<PhotoshopResult>` | 仕様変換（DPI/カラー/ビット/α） |
| `run_photoshop_guide_apply` | `file_paths, guides` | `Vec<PhotoshopResult>` | ガイド線適用 |
| `run_photoshop_prepare` | `settings: PrepareSettings` | `Vec<PhotoshopResult>` | PSD準備（統合処理） |
| `run_photoshop_layer_visibility` | `file_paths, conditions, mode, save_mode` | `Vec<PhotoshopResult>` | レイヤー表示/非表示 |
| `run_photoshop_layer_organize` | `file_paths, target_group_name, include_special, save_mode` | `Vec<PhotoshopResult>` | フォルダ格納 |
| `run_photoshop_layer_move` | `file_paths, target_group_name, create_if_missing, search_scope, conditions, save_mode` | `Vec<PhotoshopResult>` | レイヤー整理（条件ベース移動） |
| `run_photoshop_layer_lock` | `file_paths, ...` | `Vec<PhotoshopResult>` | レイヤーロック/アンロック |
| `run_photoshop_merge_layers` | `file_paths, ...` | `Vec<PhotoshopResult>` | レイヤー結合 |
| `run_photoshop_custom_operations` | `file_paths, file_ops, save_mode, delete_hidden_text?` | `Vec<PhotoshopResult>` | カスタム操作（個別表示/非表示・移動・テキスト削除） |
| `run_photoshop_split` | 多数パラメータ（mode, format, quality, selection等） | `SplitResponse` | 見開き分割 |
| `run_photoshop_replace` | `jobs: ReplaceJobSettings` | `Vec<PhotoshopResult>` | レイヤー差替え/合成 |
| `run_photoshop_rename` | `settings: RenameJobSettings` | `Vec<PhotoshopResult>` | レイヤーリネーム |
| `run_photoshop_tiff_convert` | `settings_json, output_dir` | `TiffConvertResponse` | TIFF化 |
| `run_photoshop_scan_psd` | `settings_json` | `String` | PSDスキャン |
| `poll_scan_psd_progress` | — | `Option<String>` | スキャン進捗ポーリング（同期） |
| `open_file_in_photoshop` | `file_path` | `()` | ファイルをPSで開く |

### 画像処理（Photoshop不要）
| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `resample_image` | `file_path, output_path?, options: ResampleOptions` | `ProcessResult` | DPIリサンプリング |
| `batch_resample_images` | `file_paths, output_dir?, options` | `BatchProcessResult` | 一括リサンプリング |
| `convert_color_mode` | `file_path, output_path?, target_mode` | `ProcessResult` | カラーモード変換 |
| `get_image_info` | `file_path` | `serde_json::Value` | 画像メタデータ取得 |
| `parse_psd_metadata_batch` | `file_paths` | `Vec<PsdParseResult>` | PSDメタデータ一括解析 |

### プレビュー・キャッシュ
| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `get_high_res_preview` | `file_path, max_size` | `HighResPreviewResult` | 高解像度プレビュー生成 |
| `clear_psd_cache` | — | `()` | PSDキャッシュクリア |
| `cleanup_preview_files` | — | `u32` | プレビューファイル削除（件数返却） |
| `invalidate_file_cache` | `file_path` | `()` | 特定ファイルのキャッシュ無効化 |

### PDF
| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `get_pdf_info` | `file_path` | `PdfInfoResult` | PDFページ情報 |
| `get_pdf_preview` | `file_path, page_index, max_size` | `HighResPreviewResult` | PDFページプレビュー |
| `get_pdf_thumbnail` | `file_path, page_index, max_size` | `String`(Base64) | PDFサムネイル |

### ファイル操作
| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `read_text_file` | `file_path` | `String` | テキストファイル読込 |
| `write_text_file` | `file_path, content` | `()` | テキストファイル書込 |
| `write_binary_file` | `file_path, data` | `()` | バイナリファイル書込 |
| `delete_file` | `file_path` | `()` | ファイル削除 |
| `path_exists` | `path` | `bool` | パス存在確認 |
| `list_folder_contents` | `folder_path` | `FolderContents` | フォルダ内容一覧（ファイル+サブフォルダ） |
| `list_folder_files` | `folder_path, recursive` | `Vec<String>` | ファイル一覧（再帰対応） |
| `list_all_files` | `folder_path` | `Vec<String>` | 全ファイル一覧 |
| `list_subfolders` | `folder_path` | `Vec<String>` | サブフォルダ一覧 |
| `batch_rename_files` | `entries, output_directory?, mode` | `Vec<BatchRenameResult>` | 一括ファイルリネーム（rename失敗時copy+deleteフォールバック） |
| `backup_to_temp` | `source_path` | `String` | ファイル/フォルダを一時バックアップ（Undo用） |
| `restore_from_backup` | `backup_path, original_path` | `()` | バックアップから復元（Undo用） |
| `detect_psd_folders` | `folder_path` | `serde_json::Value` | PSD含有フォルダ検出 |
| `search_json_folders` | `base_path, query` | `Vec<JsonFolderResult>` | JSONフォルダ検索 |

### ファイル監視
| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `start_file_watcher` | `app_handle, file_paths` | `()` | ファイル変更監視開始 |
| `stop_file_watcher` | — | `()` | ファイル変更監視停止 |

### フォント
| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `resolve_font_names` | `postscript_names` | `HashMap<String, FontResolveInfo>` | フォント名解決（完全一致、同期） |
| `search_font_names` | `query, max_results?` | `Vec<FontNameSearchResult>` | フォント名部分一致検索（手動追加用） |
| `list_font_folder_contents` | `folder_path, no_cache?` | `Vec<FontFileEntry>` | フォントフォルダ内容一覧 |
| `search_font_files` | `base_path, query` | `Vec<FontFileEntry>` | フォントファイル検索 |
| `install_font_from_path` | `font_path` | `String` | フォントインストール |

### ユーティリティ
| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `open_folder_in_explorer` | `folder_path` | `()` | エクスプローラーでフォルダを開く |
| `reveal_files_in_explorer` | `file_paths` | `()` | エクスプローラーでファイルを選択表示 |
| `open_with_default_app` | `file_path` | `()` | デフォルトアプリで開く |
| `launch_kenban_diff` | `folder_a, folder_b, mode?` | `()` | KENBAN差分ツール起動 |
| `launch_tachimi` | `file_paths` | `()` | Tachimiツール起動 |
| `launch_progen` | `handoff_text_path?` | `()` | ProGenツール起動 |
| `check_handoff` | — | `Option<HandoffData>` | ハンドオフデータ確認 |

## KENBAN統合 (kenban.rs — 21コマンド)

| コマンド | 用途 |
|---------|------|
| `kenban_parse_psd` | PSD解析→JPEG変換 |
| `kenban_list_files_in_folder` | フォルダ内ファイル一覧（自然順） |
| `kenban_render_pdf_page` | PDFページレンダリング |
| `kenban_get_pdf_page_count` | PDFページ数取得 |
| `kenban_open_file_in_photoshop` | Photoshopで開く |
| `kenban_save_screenshot` | スクリーンショット保存 |
| `kenban_read_text_file` | テキストファイル読込 |
| `kenban_write_text_file` | テキストファイル書込 |
| `kenban_cleanup_preview_cache` | プレビューキャッシュ削除 |
| `kenban_open_file_with_default_app` | デフォルトアプリで開く |
| `kenban_get_cli_args` | CLI引数取得 |
| `compute_diff_simple` | シンプル差分計算 |
| `check_diff_simple` | 差分有無チェック |
| `compute_diff_heatmap` | ヒートマップ差分計算 |
| `check_diff_heatmap` | ヒートマップ差分チェック |
| `decode_and_resize_image` | 画像デコード＆リサイズ |
| `preload_images` | 画像プリロード |
| `clear_image_cache` | 画像キャッシュクリア |
| `compute_pdf_diff` | PDF差分計算 |
| `open_folder` | フォルダを開く |
| `open_pdf_in_mojiq` | MojiQでPDF開く |

## ProGen統合 (progen.rs — 26コマンド)

全コマンドに `progen_` プレフィックス付き:

| コマンド | 用途 |
|---------|------|
| `progen_get_json_folder_path` | JSONフォルダパス取得 |
| `progen_list_directory` | フォルダ一覧 |
| `progen_read_json_file` | JSON読込 |
| `progen_write_json_file` | JSON書込 |
| `progen_read_master_rule` | マスタールール読込 |
| `progen_write_master_rule` | マスタールール書込 |
| `progen_create_master_label` | レーベル作成 |
| `progen_get_master_label_list` | レーベル一覧 |
| `progen_create_txt_work_folder` | テキストフォルダ作成 |
| `progen_get_txt_folder_path` | TXTフォルダパス |
| `progen_list_txt_directory` | TXTフォルダ一覧 |
| `progen_read_txt_file` | TXT読込 |
| `progen_write_text_file` | TXT書込 |
| `progen_read_dropped_txt_files` | D&D TXT読込 |
| `progen_show_save_text_dialog` | TXT保存ダイアログ |
| `progen_save_calibration_data` | 校正データ保存 |
| `progen_print_to_pdf` | PDF出力（Edge経由） |
| `progen_list_image_files` | 画像ファイル一覧 |
| `progen_list_image_files_from_paths` | パスから画像一覧 |
| `progen_load_image_preview` | 画像プレビュー生成 |
| `progen_show_open_image_folder_dialog` | フォルダ選択ダイアログ |
| `progen_show_save_json_dialog` | JSON保存ダイアログ |
| `progen_open_and_read_json_dialog` | JSON読込ダイアログ |
| `progen_launch_comic_bridge` | COMIC-Bridge起動 |
| `progen_get_comicpot_handoff` | COMIC-POTハンドオフ |

## デフォルト仕様

### モノクロ原稿
- カラーモード: Grayscale
- 解像度: 600dpi
- ビット深度: 8bit
- αチャンネル: なし

### カラー原稿
- カラーモード: RGB
- 解像度: 350dpi
- ビット深度: 8bit
- αチャンネル: なし

## UIテーマ: Daidori Blue (v3.8.2〜) — 旧 Editorial Precision (v3.6.3〜v3.8.1)

**コンセプト**: 台割マネージャー（daidori-manager-tauri）の Light Mode に合わせた **クールホワイト基調 + ブルー系グラデーション + 白文字** の清潔感ある統合ツール UI。Indigo 系から Blue 系に全面移行（v3.8.2）。

### 設計原則
1. **Subtract, don't add** — 色・装飾を極力削る
2. **Color = Meaning, not decoration** — 色は意味（成功/警告/エラー）にのみ使う
3. **Single Accent Discipline** — メインアクセントは Blue 1色に集約（旧: Indigo）
4. **Gradient = Blue + White Text** — グラデーションは全て `from-accent to-accent-hover` の青→深青に統一

### カラーパレット（v3.8.2〜）
```javascript
// 背景（台割マネージャー準拠のクール中性、白ベース）
bg-primary:   "#f8f9fc"  // クールホワイト（メイン背景）
bg-secondary: "#ffffff"  // 純白（パネル・モーダル）
bg-tertiary:  "#f0f2f5"  // クール薄グレー（カード・非アクティブ）
bg-elevated:  "#ffffff"  // 浮き上がり要素

// テキスト（深いネイビー系）
text-primary:   "#1a1a2e"  // 主要（台割マネージャー準拠）
text-secondary: "#4a4a5a"  // 副次 (9.6:1 AAA)
text-muted:     "#6b6b7a"  // 控えめ (5.5:1 AA)

// アクセント（単一Blue原則、v3.8.2〜 secondary/tertiary/warm も全てブルー系へ）
accent:           "#3a7bd5"  // Blue 主要操作
accent-hover:     "#0078d4"  // Deep Blue（ホバー時・グラデ終点）
accent-glow:      "rgba(58, 123, 213, 0.20)"
accent-secondary: "#0078d4"  // Deep Blue（from-accent to-accent-secondary グラデ用に再定義）
accent-tertiary:  "#1e90ff"  // Dodger Blue（情報ハイライト・グラデのバリエーション）
accent-warm:      "#1e6bb8"  // Steel Blue（旧 warm → 落ち着いたブルー）

// ステータス（印刷インク調、全AA）
success: "#15803d"  // 緑 (5.5:1)
warning: "#a16207"  // オレンジブラウン (5.9:1) — 警告トースト/個別オーバーライド等の意味的用途のみ
error:   "#b91c1c"  // 赤 (6.4:1)

// ガイド線
guide-h: "#dc2626"  // 水平ガイド
guide-v: "#0891b2"  // 垂直ガイド

// フォルダアイコン: Windows風マニラフォルダ（オレンジよりの黄色）
folder:        "#f5b73d"  // マニラフォルダ基調
folder-hover:  "#ffc857"  // ホバー時
folder-dark:   "#d49a2b"  // 縁・影表現

// 漫画装飾カラー: 事実上廃止（ほぼ無彩色、globals.cssで強制上書き）
manga-pink: "#f5ecec", manga-mint: "#eaf0eb",
manga-lavender: "#ecebf0", manga-peach: "#f2ede4",
manga-sky: "#e8ecf0", manga-yellow: "#f3f0e4"

// ボーダー（クール中性）
border:       "#d5d9e0"  // 明確な区切り
border-light: "#e5e7ec"  // 薄い区切り
```

### グラデーション運用ルール（v3.8.2）
- **全ての CTA ボタン**（ワークフロー・実行・差替え・スキャン・リネーム・校正・ProGen 等）は `bg-gradient-to-r from-accent to-accent-hover text-white` で統一
- `from-accent to-accent-secondary` パターンは accent-secondary を Deep Blue に再定義したため自動的に青グラデに変換
- 旧ホットピンク `rgba(255,90,138,*)` / パープル `rgba(124,92,255,*)` / ミント `rgba(0,212,170,*)` のシャドウ・グロー類は全て `rgba(58,123,213,*)` / `rgba(0,120,212,*)` に置換済
- TIFF 系ボタンの `from-accent-warm to-accent`（旧オレンジ系）も accent-warm を Steel Blue 化で自動的に青系へ
- `from-[#31A8FF] to-[#0066CC]` の Photoshop ブランドブルー、分割ビューアの `from-[#00bcd4] to-[#00e5ff]` L/R 識別シアンは **意味的用途** として維持
- `bg-[#1a1a1e]` のダークモード反転用黒背景は `dark-mode-invert` 下で相殺されるため維持（globals.css 参照）

### フォルダアイコン適用箇所（v3.8.2）
ファイルシステム上のフォルダを示す SVG には全て `text-folder` を使用:
- SpecCheckView メインファイルブラウザ・フォルダ階層ツリー
- JsonFileBrowser / ProgenJsonBrowser / ProgenCalibrationSave
- ScanPsdContent の登録フォルダリスト
- CompactFileList / TiffFileList / TiffBatchQueue のサブフォルダヘッダー
- FileBrowser の現在パス表示、DropZone の空状態大アイコン

PSD レイヤーグループアイコン（`text-manga-lavender`）はフォルダではなく **レイヤー意味的用途** なので維持。

### フォント（v3.6.3〜 刷新）
- **UI本文**: Inter + Noto Sans JP + Yu Gothic UI fallback
- **見出し**: IBM Plex Sans JP + Noto Sans JP fallback（Zen Maru Gothic廃止）
- **コード**: JetBrains Mono + IBM Plex Mono + Consolas fallback
- **index.html**: Google Fonts経由ロード（Inter/IBM Plex Sans JP/JetBrains Mono）
- **ベース**: 15px / line-height 1.65 / font-weight 450 / letter-spacing 0.003em
- **feature-settings**: "palt", "calt"（日本語プロポーショナル + 合字）

### Type Scale（Tailwind fontSize、最小12px保証）
```javascript
'xs':   ['12px', { lineHeight: '1.55', letterSpacing: '0.005em'  }]
'sm':   ['13px', { lineHeight: '1.6',  letterSpacing: '0.003em'  }]
'base': ['14px', { lineHeight: '1.65'                            }]
'md':   ['15px', { lineHeight: '1.6'                             }]
'lg':   ['17px', { lineHeight: '1.55', letterSpacing: '-0.005em' }]
'xl':   ['19px', { lineHeight: '1.5',  letterSpacing: '-0.01em'  }]
'2xl':  ['22px', { lineHeight: '1.45', letterSpacing: '-0.015em' }]
'3xl':  ['28px', { lineHeight: '1.35', letterSpacing: '-0.02em'  }]
'4xl':  ['34px', { lineHeight: '1.3',  letterSpacing: '-0.025em' }]
```

### フォントサイズ強制引き上げ（globals.css）
`text-[Npx]`アービトラリ値クラスを最小12pxに上書き:
```css
.text-\[8px\], .text-\[9px\]  { font-size: 12px !important; line-height: 1.55 !important; }
.text-\[10px\]                { font-size: 12.5px !important; line-height: 1.55 !important; }
.text-\[11px\], .text-\[12px\] { font-size: 13px !important; line-height: 1.6 !important; }
```
- レイアウト・構造は一切変更せず、フォントサイズ・行間・文字色のみ調整
- `button, a, label, [role="button"]` の最低 font-weight を 500 に強制

### 【防衛策】レイアウト破綻防止（globals.css）
フォント拡大に伴う flex item の溢れを防ぐ:
```css
.flex > *, .inline-flex > * { min-width: 0; }
td, th { overflow: hidden; text-overflow: ellipsis; }
```

### 【機能カラー化】metadata バッジの色剥奪（globals.css）
装飾色を完全に廃止し、色は意味（semantic）のみに使用:
```css
[class*="bg-manga-"]   { background-color: #f0f2f5 !important; /* bg-tertiary */ }
[class*="text-manga-"] { color: #4a4a5a !important;            /* text-secondary */ }
```
- 原稿仕様パネル等の「8bit」「350 dpi」「RGB」バッジは自動的にニュートラル化
- 結果として「本当の警告色（赤/緑/橙）」が画面で際立つ

### バッジ体系（4種固定）
| 種別 | 背景 | テキスト | 用途 |
|------|------|---------|------|
| Success | `bg-success/12` | `text-success` | OK・完了・合格 |
| Error | `bg-error/12` | `text-error` | NG・エラー |
| Warning | `bg-warning/12` | `text-warning` | 注意・確認要 |
| Neutral | `bg-bg-tertiary` | `text-text-secondary` + `border-border-light` | **その他全て**（DPI/カラーモード/サイズ/フォント名等） |

### TopNav 左タブの視認性（globals.css）
```css
nav button.text-text-secondary { color: #1a1a2e !important; }
nav button.text-text-secondary:hover { color: #3a7bd5 !important; }
nav button.text-text-secondary:focus::after { /* 下線演出 */ }
```
- 背景・枠線は付与せず、色のみ濃色化してミニマルなフラットデザインを維持
- `:focus::after` で選択中のタブに下線を表示（擬似アクティブ状態）

### デザイン要素
- **角丸**: xl=12px / 2xl=16px / 3xl=20px（中間値、ソフト感維持）
- **影**: ドロップシャドウ維持（`soft`/`card`/`elevated`、rgba(26,26,46)ベース）
- **グロー**: 3色変種（`glow-pink`/`glow-purple`/`glow-mint`）全て Blue 系に統一（旧 Indigo）
- **グラデーション**: 同系色のみ（Blue → Deep Blue、`from-accent to-accent-hover`）
- **スクロールバー**: 10px幅、クール中性グレー（#c2c7d0 → #9da4b0）
- **フォーカスリング**: 2px solid #3a7bd5
- **選択色**: 半透明 Blue（rgba(58,123,213,0.2)）
- **プレビュー背景**: SpecCheckViewの右パネルプレビュー（`FilePreviewImage`）は `bg-bg-primary` に統一（ファイル未選択時・表示時ともにクールホワイト背景）

## 主要依存関係

### フロントエンド
- React 18.3.1、Zustand 5.0.0、ag-psd 30.1.0
- Tailwind CSS 3.4.15、Vite 5.4.0、TypeScript
- @tauri-apps/api 2.0.0
- Tauriプラグイン: dialog, fs, process, updater
- diff 8.0.3（KENBAN text diff）
- jspdf 4.0.0（KENBAN PDF generation）
- lucide-react 0.562.0（KENBAN icons）
- pdf-lib 1.17.1（KENBAN PDF manipulation）
- pdfjs-dist 5.4.530（KENBAN PDF rendering）
- utif 3.1.0（KENBAN TIFF decoding）

### Rust
- tauri 2.0、tokio（非同期ランタイム）、serde（シリアライズ）
- pdfium-render（PDF処理）、fontdb + ttf-parser（フォント解決）
- image（画像処理）
- base64 0.22, open 5, dirs 5, natord 1.0（KENBAN/ProGen用）

## 開発コマンド

```bash
# 開発サーバー起動
npm run tauri dev
# または
start-dev.bat

# ビルド
npm run tauri build
# または
build.bat

# フロントエンドのみ
npm run dev

# コード整形（Prettier）
npm run format
```

## リリース手順

新バージョンをリリースする際の手順:

### 1. バージョン番号を更新（3ファイル）
```bash
# 以下の3ファイルのバージョンを更新する
package.json           → "version": "x.x.x"
src-tauri/tauri.conf.json → "version": "x.x.x"
src-tauri/Cargo.toml      → version = "x.x.x"
```

### 2. コミット・プッシュ
```bash
git add -A
git commit -m "v1.x.x: 変更内容の要約"
git push origin main
```

### 3. タグを作成・プッシュ（CIトリガー）
```bash
git tag v1.x.x
git push origin v1.x.x
```

タグのpushにより `.github/workflows/release.yml` が自動実行され、以下が生成・アップロードされる:
- `Comic-Bridge_x.x.x_x64-setup.exe` — NSISインストーラー
- `Comic-Bridge_x.x.x_x64-setup.exe.sig` — Tauri Updater署名ファイル
- `latest.json` — 自動アップデート用メタデータ

### 4. CI完了確認
```bash
gh run list --limit 3          # ワークフロー一覧
gh run watch <run_id>          # リアルタイム進捗
gh release view v1.x.x --json assets -q '.assets[].name'  # アセット確認
```

### 注意事項
- **署名キー**: `TAURI_SIGNING_PRIVATE_KEY` と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` はGitHub Secretsに設定済み（ローカルビルドでは不要）
- **ビルド時間**: CI完了まで約14〜16分
- **タグの再作成**: タグが既にリモートにある場合は `git push origin :refs/tags/v1.x.x` で削除してから再作成
- **リリースページ**: `https://github.com/yamamoto-ryusei-ux/COMIC-Bridge-integrated/releases/tag/v2.x.x`
- **CI**: `tauri-apps/tauri-action@v0.5`を使用（`updaterJsonPreferNsis: true`, `includeUpdaterJson: true`でlatest.json自動生成）

### 重要: アプリ識別子とproductName
- **identifier**: `com.comic-bridge-integrated.app`（通常版`com.comic-bridge.app`と異なる。同一identifierだとWindowsレジストリで同一アプリ扱いになりショートカットが上書きされる）
- **productName**: `COMIC-Bridge-Integrated`（ASCII文字のみ。日本語を含めるとリリースアセットファイル名が化けてlatest.jsonのURLと不一致になる）
- **ウィンドウタイトル**: `COMIC-Bridge 統合版`（app.windows[0].titleで設定、日本語OK）
- **これらの値を変更する場合**: identifier変更→別アプリとして認識（旧版と共存/上書き問題）。productName変更→インストール先フォルダが変わり自動更新が別アプリに向く
- **⚠ 既知の問題: 通常版COMIC-Bridgeとのショートカット競合**: 統合版をインストールすると通常版（Ina986/COMIC-Bridge）のデスクトップショートカットが上書きされる場合がある。identifier・productNameを分離済みだが、Tauri NSISインストーラーのデフォルト動作で完全に回避できていない。hooks.nshではショートカットに一切触れない方針。通常版のショートカットが消えた場合は通常版のインストーラーを再実行して復元する必要がある

### 重要: 作業フォルダとgit操作について
- **作業フォルダに直接gitをセットアップすること**。別フォルダにクローンしてファイルをコピーする方法は禁止（変更漏れ・新規ファイルの見落とし・コミット履歴の不整合が発生する）
- ZIPから展開したフォルダで `.git` がない場合: `git init` → `git remote add origin <URL>` → `git fetch origin main` → `git reset origin/main`（作業ツリーを保持したままリモート履歴に接続）
- **`gh release create` だけではCIはトリガーされない**。必ず `git tag` + `git push origin <tag>` でタグをpushすること（CIは `on: push: tags: 'v*'` で発火する）
- **ローカルではTauriのリリースビルドはできない**（署名キーがGitHub Secretsにのみ存在）。ビルド・署名・アップロードは全てCI任せ

### 重要: コード同期時の `.github/` ディレクトリ
- タグやZIPからコードを同期する際は、**`.github/workflows/release.yml` も必ず同期すること**
- CIワークフローには **PDFiumダウンロードステップが必須**（`pdfium.dll`は`.gitignore`管理のためリポジトリに含まれない）
- このステップが欠落するとCIビルドが `resource path resources\pdfium\pdfium.dll doesn't exist` で失敗する
- 同期時のチェックリスト: `src/`, `src-tauri/`, ルートconfig, **`.github/`**

### DEMO 版 GitHub リモート (2026-04-24 追加)
- **デモ配布用リモート**: `demo` → `https://github.com/noguchi-kosei-del/Comic-Bridge-DEMO.git`
- **`origin` は従来通り** `yamamoto-ryusei-ux/COMIC-Bridge-integrated.git`（CI/リリース本線）
- **ローカル `main` の tracking は `origin/main`**。DEMO への反映は明示的に `git push demo main` で行う（`-u` は付けない）
- `.gitignore` 追加エントリ（Desktop.ini と個人メモを誤コミットしないため）:
  ```
  Desktop.ini
  comicbridge改善案.txt
  ```
- **折りたたみ方針**: DEMO への push は「UI 大幅更新を 1 コミットにまとめる」方針（大量の小コミットを DEMO リポジトリに残さない）。本線 `origin` へ push する場合は通常通りコミットを分割する

### フォルダをリネーム／移動した場合のビルドキャッシュ
- `src-tauri/target/` 内の **Tauri プラグイン権限ファイルに絶対パスが焼き込まれる** ため、フォルダをリネーム／移動すると dev ビルドが `failed to read plugin permissions: ... (os error 3)` で失敗する
- 対処: `cd src-tauri && cargo clean`（旧パス参照を含む `target` を全削除）→ `start-dev.bat` で再ビルド
- ついでに `pdfium.dll` が消えていても `start-dev.bat` の `:download_pdfium` サブルーチンが自動 DL するので手動配置は不要
- **注意**: cargo clean は 8GB 超のキャッシュを削除するため、クリーン後の初回ビルドは 10〜15 分かかる

## localStorage永続化

```typescript
// specStore.ts（手動localStorage）
autoCheckEnabled: boolean     // 自動チェック有効/無効 — キー: "autoCheckEnabled"
lastSelectedSpecId: string    // 前回選択した仕様ID — キー: "lastSelectedSpecId"

// tiffStore.ts（手動localStorage）
settings: TiffSettings        // TIFF変換設定（crop.bounds除く）— キー: "tiff_lastSettings"
cropPresets: TiffCropPreset[]  // 保存済みクロップ範囲 — キー: "tiff_cropPresets"

// scanPsdStore.ts（手動localStorage）
jsonFolderPath: string         // JSONフォルダパス
saveDataBasePath: string       // scandata保存先パス
textLogFolderPath: string      // テキストログフォルダパス
```

## ガイドエディタのショートカット

| 操作 | キー |
|------|------|
| 元に戻す | Ctrl + Z |
| やり直す | Ctrl + Y / Ctrl + Shift + Z |
| ズームイン | Ctrl + (+/=) |
| ズームアウト | Ctrl + (-) |
| ズームリセット | Ctrl + 0 |
| パン | Space + ドラッグ |
| ガイド削除 | Delete / Backspace |

- 水平定規からドラッグ → 水平ガイド（Y軸位置）
- 垂直定規からドラッグ → 垂直ガイド（X軸位置）
- ガイドクリックで選択 → 選択中はハイライト表示
- Undo/Redo: 最大20ステップの履歴管理（guideStore）

## クロップエディタのショートカット（Tachimi互換）

| 操作 | キー |
|------|------|
| 元に戻す | Ctrl + Z |
| やり直す | Ctrl + Y / Ctrl + Shift + Z |
| ズームイン | Ctrl + (+/=) |
| ズームアウト | Ctrl + (-) |
| ズームリセット | Ctrl + 0 |
| パン | Space + ドラッグ |
| ガイド削除 | Delete / Backspace（ガイド選択時） |
| 選択範囲削除 | Delete / Backspace（範囲のみ時） |
| ガイド移動 | 矢印キー 1px / Shift+矢印 10px |
| 選択範囲移動 | 矢印キー 10px / Shift+矢印 1px |
| 選択解除 | Escape |

## グローバルショートカット

| 操作 | キー | ビュー |
|------|------|--------|
| 全選択 | Ctrl+A | 全タブ（INPUT/TEXTAREA/SELECT内は除外） |
| Photoshopで開く | P | レイヤー制御・仕様チェック・ビューアー（表示中ファイル） |
| フォルダを開く | F | 全タブ（ビューアーモードでは表示中ファイル） |
| 前のページ | ←/↑ | レイヤー制御ビューアー・ビューアータブ |
| 次のページ | →/↓ | レイヤー制御ビューアー・ビューアータブ |
| ページ送り | マウスホイール | レイヤー制御ビューアー・ビューアータブ |
| 全画面切替 | ボタン | ビューアー/差分/分割タブ（Esc で解除、OSフルスクリーン連動） |

## CSP（Content Security Policy）

- `worker-src blob:` — KENBAN Web Worker用
- `script-src 'unsafe-eval' blob:` — pdfjs-dist等のワーカー実行用
- `frame-src 'self'` — ProGen iframe埋め込み用

## 統合アーキテクチャ（KENBAN・ProGen）

### KENBAN統合方式
- React統合: KenbanApp.tsx をKenbanView.tsx でラップ
- **スタイル隔離**: `kenban-scope` CSSクラスで全スタイルをスコープ化（Tailwind v4→v3変換対応）。KENBANのCSS（kenban.css, kenbanApp.css）はkenban-scopeクラス内でのみ有効
- **状態保持型マウント**: ViewRouterでdisplay切替（`display: none`/`block`）によりコンポーネントをアンマウントせず状態を保持。kenban / progen / unifiedViewer の3ビューが対象
- Rust側: kenban.rs に21コマンドを集約。rayon並列処理で画像差分を高速計算

### ProGen統合方式
- **React統合**: iframe廃止、Zustand + Tailwindで本体と完全統合
- **Tauriコマンド**: `useProgenTauri.ts` が `@tauri-apps/api/core` invoke経由。全コマンドは `progen_` プレフィックス付き
- **状態管理**: `progenStore.ts`（Zustand）で全ProGen状態を一元管理。COMIC-POTエディタのみ`useComicPotState`（useReducer）でローカル管理
- **画面ルーター**: `ProgenView.tsx` で `progenStore.screen` に基づき6画面を切替
- **状態保持型マウント**: KENBANと同様にdisplay切替で状態保持
- Rust側: progen.rs に26コマンドを集約（変更なし）

## 最近の変更（テキストエディタビュー・校正編集ワークフロー）

### 概要

ヘッダー「ProGen」の右に新ビュー **「テキストエディタ」** を追加し、ProGen-tauri のテキスト編集機能を移植。ビューアーと同一ストア（`useUnifiedViewerStore`）を共有しつつ、校正ワークフロー専用のレイアウト / プリセットを持つ。併せて UnifiedViewer 側のパネル UI、上部ツールバー、ナビゲーション UX を整理した。

### ヘッダー（TopNav）
- `ALL_NAV_BUTTONS`（[src/store/settingsStore.ts](src/store/settingsStore.ts)）に `{ id: "textEditor", label: "テキストエディタ", icon: FileEdit }` を ProGen の直後に追加。`migrateNavBar` にも同位置への挿入ロジックを追加（既存ユーザーの localStorage 対応）。
- `AppView`（[src/store/viewStore.ts](src/store/viewStore.ts)）union に `"textEditor"` を追加。
- `NavBarButtons`（[src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx)）で現在の `activeView` / `specViewMode` に応じたアクティブマーカー（`bg-accent/15 text-accent ring-1 ring-accent/40` + `aria-current="page"`）を常時表示。

### TextEditor ビュー
- 新ラッパー [src/components/views/TextEditorView.tsx](src/components/views/TextEditorView.tsx) は `<UnifiedViewer textEditorMode />` を描画するだけの軽量ビュー。
- UnifiedViewer は `textEditorMode?: boolean` props を受け、true の時:
  - タブセレクタから `files` / `layers` / `spec` / `editor` を除外し、`突き合わせ` / `校正編集` のプリセット 2 ボタンだけ表示
  - 画像表示は 校正編集 時に格納（プリセットで制御）
- ViewRouter（[src/components/layout/ViewRouter.tsx](src/components/layout/ViewRouter.tsx)）に `textEditorMounted` を追加、`display: contents` トグルで state 保持型 mount。
- UnifiedViewer は両ビューから同時 mount される前提のため、activeView 同期 useEffect を `textEditorMode ? "textEditor" : "unifiedViewer"` で分岐。

### パネル分割（`src/components/unified-viewer/panels/`）
- **[hooks/useTextDiff.ts](src/components/unified-viewer/hooks/useTextDiff.ts)** — PSD テキストレイヤー vs 原稿 COMIC-POT の差分計算フック。UnifiedViewer から diff useEffect + `textDiffResults` state を抽出。
- **[panels/ProofreadPanel.tsx](src/components/unified-viewer/panels/ProofreadPanel.tsx)** — 校正JSON 表示。`useUnifiedViewerStore` の `checkData` / `checkTabMode` 直接参照。`checkTabMode === "both"`（全て）時は **ProGen の parallel view に倣って 2 カラム** (✅ 正誤チェック ｜ 📝 提案チェック) の横並び表示。
- **[panels/DiffPanel.tsx](src/components/unified-viewer/panels/DiffPanel.tsx)** — テキスト照合（diff）。`useTextDiff` の結果と `UnifiedDiffDisplay` を組み合わせて描画。diff 表示モード `psd / text` は panel 内 local state。
- **[panels/TextEditorDropPanel.tsx](src/components/unified-viewer/panels/TextEditorDropPanel.tsx)** — ProGen `cpEditTextArea` 相当:
  - 上段ツールバー: [開く] [保存] [別名] [コピー] [クリア]
  - 下段ツールバー（要テキスト）: [// 削除マーク] [ルビ付け]
  - 中段: HTML5 D&D + `<textarea>`（空時は ドロップメッセージ）
  - 末尾フッター: 文字数 / 行数 / 未保存ヒント
  - D&D は `dragDropEnabled: false` 配下の webview D&D（`file.text()` で UTF-8 読込）、path が取れないので別名保存にフォールバック
  - 「開く」は `@tauri-apps/plugin-dialog.open` + `@tauri-apps/plugin-fs.readFile` + `TextDecoder("utf-8")`
  - 「保存」は既存 Rust コマンド `write_text_file` を invoke
  - 改行正規化 (`\r\n/\r → \n`) + BOM 除去を `applyContent` で実施
  - textarea `onChange` は 500ms debounce で `parseComicPotText` を再実行し store の `textHeader` / `textPages` を更新
  - 削除マーク: 選択行全体に `//` プレフィックスをトグル、カーソル位置補正 + `scrollTop` 復元
  - ルビ付け: `showPromptDialog` でふりがな入力 → COMIC-POT 形式 `親（ふりがな）` で置換。ダイアログ前に `scrollTop` 保存 → 置換後に復元（最下段への自動スクロール防止）

### UnifiedViewer 側の UI 整理

**上部ツールバー（`flex-shrink-0 h-7 bg-bg-secondary ...`）**
- 右端に出ていた `cur.name` / `dims.w × dims.h` 表示を削除
- 「連動」トグルスイッチを新設 → 後に撤去。`pageSync` は常時 `true` の const に固定

**タブセレクタバー（`h-7 bg-bg-tertiary/50 ...`）**
- 左端に [ファイル展開/格納トグル]（`＞` / `＜`、`Ctrl+Shift+E` で 'far-left' ⇔ null トグル）
- 各タブボタンに lucide アイコン（`Folder` / `Layers` / `Ruler` / `Type` / `ClipboardCheck` / `GitCompare` / `FileEdit`）
- 配置移動 `◀ / ▶` ボタンは削除
- `textEditorMode` 時は **[突き合わせ] [校正編集] プリセット**のみ表示（その他ボタンは `!textEditorMode` ガード）

**プリセット**
- **突き合わせ**: `text → far-right`、`proofread / diff / editor → null`、`files → far-left`、`viewerVisible=true`
- **校正編集**: `proofread → left-sub`、`editor → far-right`、`text / diff / files → null`、`viewerVisible=false`
- `isMatchMode` / `isProofMode` は tabPositions から排他的に判定してボタンをハイライト

**メインエリアレイアウト**
- 中央ページリスト（`w-8 flex-shrink-0 bg-bg-secondary border-r border-border/30 ...`）は削除
- センター画像ビューアーは `textEditorMode && !viewerVisible` 時に `hidden` クラスで display:none
- `textEditorMode && !viewerVisible`（校正編集）時は **専用 2 カラムレイアウト**: `left-sub` / `far-left` タブを左 50%、`far-right` / `right-sub` タブを右 50% に描画。中央画像をスキップし 50/50 を保証。それ以外では従来の LEFT / CENTER / RIGHT 3 カラム。
- 左右サイドパネルは `leftPanelWidth` / `rightPanelWidth` の state（min 150 / max 600 / 初期 272）でリサイズ可能。境界ハンドルの mousedown で `resizeStart.current = {x, width}` を保存、window mousemove で delta 計算して更新。
- 左右パネルヘッダ（`h-5 bg-bg-tertiary/30 ...`）から `PANEL_POSITION_LABELS`（「左端」「左サブ」「右サブ」「右端」）を削除、タブ名と✕のみ表示。

### store 側の調整
- [unifiedViewerStore.ts](src/store/unifiedViewerStore.ts) `PanelTab` union に `"editor"` 追加、初期 `tabPositions` は `{ files: "far-left", text: "right-sub" }`。
- `setTabPosition` に位置制約ルール:
  - `files` は `"far-left"` または `null` のみ許可（他は強制的に `"far-left"` に振替）
  - `text` / `proofread` / `diff` は `"far-left"` を拒否し `null` に振替
- ビューアー view（`!textEditorMode`）では activeView 切替時に `proofread` が `far-right` 以外なら `far-right` に自動移動、`editor` が非 null なら `null` に退避。

### 開発時の小改修
- `CONTEXT_MENU_ENABLED = false`（[UnifiedViewer.tsx](src/components/unified-viewer/UnifiedViewer.tsx) / [SpecCheckView.tsx](src/components/views/SpecCheckView.tsx)）で右クリック独自コンテキストメニューを無効化（WebView2 の Inspect を使いやすくする目的、再有効化は `true` に戻すだけ）。

### 主要再利用ユーティリティ
| 用途 | 参照先 |
| --- | --- |
| COMIC-POT パーサ | [utils.ts:33](src/components/unified-viewer/utils.ts) `parseComicPotText` |
| 校正JSONブラウザ | [UnifiedSubComponents.tsx](src/components/unified-viewer/UnifiedSubComponents.tsx) `CheckJsonBrowser` |
| diff 表示 | [UnifiedSubComponents.tsx](src/components/unified-viewer/UnifiedSubComponents.tsx) `UnifiedDiffDisplay` |
| テキスト正規化 | [kenban-utils/textExtract.ts](src/kenban-utils/textExtract.ts) `normalizeTextForComparison` |
| プロンプトダイアログ | [viewStore.ts](src/store/viewStore.ts) `showPromptDialog` |
| 保存コマンド | Rust `write_text_file`（既存、ProGen と共通） |

### ProGen-tauri 側の関連変更（`C:\Users\noguchi-kosei\Desktop\ネイティブデータ\ProGen-tauri`）
`proofreadingTxtManageModal`（校正ページのセリフTXTファイル管理モーダル）の「＋ ファイルを追加」ボタンの **左にレーベル選択ボタン + 選択中表示** を追加。
- `src/index.html` — モーダル内ボタン行を flex 横並びにし、`<button class="btn btn-label" onclick="openLabelSelectModal('proofreading')">レーベル選択</button>` と `#proofreadingTxtManageLabelText` span を挿入。「すべてクリア」は `margin-left:auto` で右端固定。
- `src/js/progen-proofreading.js`:
  - `changeProofreadingLabel()` で新 span も同期更新
  - `openProofreadingTxtManageModal()` 冒頭で、メインヘッダの `proofreadingLabelSelectorText` からモーダル側表示へコピー

既存のレーベル選択モーダル（`openLabelSelectModal('proofreading')`）とルール読込（`loadLabelRulesForProofreading`）は変更なし — モーダル内のボタンは同じハンドラを呼ぶだけ。

---

## 最近の変更（ProGen 準拠 UI 整理・View 独立化・Explorer 風リスト）

前節（「テキストエディタビュー・校正編集ワークフロー」）で導入した統合ビューアー / テキストエディタ View をさらに整理した。主なテーマは **ProGen との UI 整合性向上 / ビューアーとテキストエディタの完全独立 / 不要 UI の撤去 / リスト表示の Explorer 化**。

### 1. 校正チェック項目の ProGen 準拠化
[ProgenProofreadingView.tsx](src/components/progen/ProgenProofreadingView.tsx)
- **正誤チェック (simple)**: 3 項目 → ProGen と同じ **7 項目 + 統一表記ルール** に刷新（誤字・脱字 / 人名ルビ / 常用外漢字 / 熟字訓 / 単位の誤り / 伏字チェック / 人物名チェック + divider + 統一表記ルール反映確認）。
- **提案チェック (variation)**: 10 項目を ProGen に合わせて差し替え（漢字/ひらがな統一 / カタカナ表記 / 送り仮名の違い / 長音記号 / 中黒 / イコール / 巻またぎ / 固有名詞・商標 / 専門用語・事実 / 未成年表現）。
- アイコンを文字ワンポイントから `<SVG>` ヘルパー + 共通 props の Lucide ライクな線画に変更。`CheckItem.icon: ReactNode` へ型拡張。
- ヘッダー文言を `"チェック項目（N項目 × 5パス）"` → `"正誤チェック項目（7項目 + ルール確認）"` / `"提案チェック項目（10項目）"` に統一。

### 2. 突き合わせモードの左ファイル一覧パネルを削除
[UnifiedViewer.tsx](src/components/unified-viewer/UnifiedViewer.tsx)
- `applyMatch`（突き合わせプリセット）で `files` 位置を `"far-left"` → `null` に変更 → 突き合わせ時はファイル一覧を表示しない。
- textEditorMode 進入時の useEffect 分岐で、`files` が `"far-left"` に残っている場合は `null` に退避する処理を追加（既定 store が `files: "far-left"` だった頃の持ち越し対策）。

### 3. 校正編集に ProGen の並び替えツールを移植
[utils.ts](src/components/unified-viewer/utils.ts) + [panels/TextRearrangeView.tsx](src/components/unified-viewer/panels/TextRearrangeView.tsx) + [panels/TextEditorDropPanel.tsx](src/components/unified-viewer/panels/TextEditorDropPanel.tsx)
- `utils.ts` にチャンク系ヘルパーを追加（ProGen の `cpParseTextToChunks` / `cpReconstructText` / `cpExtractComicPotHeader` 相当）
  - `parseTextToChunks(inputText)`: dialogue（空行区切り）と separator（`<<NPage>>` / `[N巻]` / `----------`）に分割
  - `reconstructTextFromChunks(chunks, header)`: separator 隣接は 1 行、dialogue 同士は 2 行で再結合
  - `extractComicPotHeader(content)`: `[COMIC-POT(:xxx)]` ヘッダー行の抽出
  - 型: `TextChunk = { content: string; type: "dialogue" | "separator" }`
- **TextRearrangeView**（新規）: ProGen の `cpRenderSelectMode` を React 移植
  - `<pre>` にチャンクを inline span で配置し、改行ギャップは prev/next が separator かで `\n` or `\n\n` を挿入
  - クリック選択で黄色ハイライト（`!bg-yellow-300 !text-black`、ProGen `#fde047` 相当）、`//` 先頭セリフは赤＋取り消し線、`[親](ふりがな)` を検出してルビ表示
  - ドラッグ中は `opacity-30 scale-[0.97]`、ドロップ位置はセル上半/下半で before/after 判定 + `.cp-drop-indicator` 相当のアクセント線
  - ミニツールバー: [上へ] / [下へ] / [削除] / [編集] + `N セリフ / 選択中: M` カウンタ
  - キーボード: `↑/↓` で dialogue 間選択、`Ctrl+↑/↓` で順序入替、`Del/Backspace` で削除、`Esc` で選択解除、ダブルクリックで編集モード復帰
  - 順序変更時は `reconstructTextFromChunks` で再構築し親 `onChange` で store の `textContent` を更新 → textarea に切り替えても同期
- **TextEditorDropPanel** にモード切替を追加
  - 内部 state `mode: "edit" | "rearrange"`
  - Toolbar row 2 に [編集] / [並び替え] トグル（Pencil / ArrowUpDown アイコン、アクティブはアクセント塗り）
  - `mode === "edit"` でのみ `//削除マーク` / `ルビ付け` を表示、`mode === "rearrange"` 時は `<TextRearrangeView />` が textarea の代わりに描画

### 4. ビューアーとテキストエディタの state 独立化
[unifiedViewerStore.ts](src/store/unifiedViewerStore.ts) + [UnifiedViewer.tsx](src/components/unified-viewer/UnifiedViewer.tsx) + [useViewerFileOps.ts](src/components/unified-viewer/useViewerFileOps.ts) + panels

**背景**: ビューアーとテキストエディタで同一 `useUnifiedViewerStore` を共有していたため、ビューアーで項目変更（ファイル切替 / タブ配置 / テキスト内容）するとテキストエディタ側の表示が上書きされる問題があった。

- **store をファクトリ化**: `create(...)` 直書きを `createUnifiedViewerStore(): UnifiedViewerStore` に抽出。2 インスタンス生成:
  - `useUnifiedViewerStore` … ビューアー View（外部からの参照先はこちら維持）
  - `useTextEditorViewerStore` … テキストエディタ View 専用
- **スコープ伝播コンテキスト**: `ScopedViewerStoreProvider` + `useScopedViewerStore()` / `useScopedViewerStoreApi()` を追加。Provider は React Context で現在のスコープ store を注入、フックは `zustand/useStore` 経由で state / API を返す。
- **UnifiedViewer を 2 層分割**:
  - 外側 `UnifiedViewer`: `textEditorMode` から store インスタンスを選び `<ScopedViewerStoreProvider store=...>` で包むだけの薄いラッパー
  - 内側 `UnifiedViewerInner`: `useScopedViewerStore()` / `useScopedViewerStoreApi()` を利用。既存の `useUnifiedViewerStore.getState()` × 9 箇所を `storeApi.getState()` に置換
- **配下の直接参照も置換**:
  - [useViewerFileOps.ts](src/components/unified-viewer/useViewerFileOps.ts): `useUnifiedViewerStore()` → `useScopedViewerStore()`
  - [panels/TextEditorDropPanel.tsx](src/components/unified-viewer/panels/TextEditorDropPanel.tsx): 全 import / 呼出しを `useScopedViewerStore` に置換
  - [panels/ProofreadPanel.tsx](src/components/unified-viewer/panels/ProofreadPanel.tsx): 同上
- **共有されるもの**: `psdStore`（アプリ全体で共有の PSD ファイル群）。各 View の `doSync()` が psdStore.files から自分の store にコピーするため、同じ元データから独立した派生 state を持つ形。
- **独立化される state**: `tabPositions` / `displacedTabs` / `currentFileIndex` / `textContent` / `textFilePath` / `textHeader` / `textPages` / `isDirty` / `checkData` / `checkTabMode` / `checkSearchQuery` / `fontPresets` / `editMode` / `selectedBlockIds`

### 5. フォルダパス入力バー / フォルダ階層ツリーの撤去
[GlobalAddressBar.tsx](src/components/layout/GlobalAddressBar.tsx) + [SpecCheckView.tsx](src/components/views/SpecCheckView.tsx)

- **GlobalAddressBar を骨抜き**: 戻る / 進む / 上へ / 再読込 / リセット / パス入力フォーム を全て削除。ワークフロー実行中のみ `<WorkflowDescriptionBar />` を返し、それ以外は `null`。未使用 import（`usePsdStore` / `useUnifiedViewerStore` / `useViewStore` / `usePsdLoader` / `dialogOpen` / `createPortal` / React hooks）を削除。
- **SpecCheckView の左詳細パネル**:
  - `<FolderBreadcrumbTree>` 呼び出しを 2 箇所（ファイル選択時 / 未選択時）削除
  - パネル見出しを `"フォルダ階層"` → `"詳細"` に変更
  - ファイル未選択時は「ファイルを選択すると詳細が表示されます」プレースホルダを表示
  - `FolderBreadcrumbTree` 関数定義を削除、未使用になった `desktopPath` state / `useEffect` / `useSettingsStore` import も撤去

### 6. 並び替えドロップダウン（種類 / 昇順 / 降順）の削除
[SpecCheckView.tsx](src/components/views/SpecCheckView.tsx)
- ツールバーから **sort key dropdown**（名前 / 更新日 / 種類）と **sort direction dropdown**（昇順 / 降順）を両方削除。
- `sortKey` / `sortAsc` state / setter を撤去。並び順は **名前・昇順固定**。
- `sortedFiles` useMemo は `[...files]` にシンプル化、`PsdFileListView` に渡す `fileSorter` も `(arr) => [...arr]` の恒等関数。
- 種類ドロップダウンの右にある **ファイル種別フィルタ**（全て / PSD / PDF / 画像 / テキスト）と `PdfModeButton` は残置。

### 7. リスト表示のカラムを Explorer 風にリサイズ可能化
[SpecCheckView.tsx](src/components/views/SpecCheckView.tsx) `PsdFileListView`
- **カラム定義**: `LIST_COLS: ListCol[]` を定義（9 列: 結果 / ファイル名 / 種類 / カラー / サイズ / DPI / Bit / テキスト / ガイド）。各列に `id / label / defaultW / minW / align` を持つ。整列は Tailwind JIT 抽出のため `LIST_COL_ALIGN_CLS` で `"text-left" | "text-center" | "text-right"` を静的マッピング。
- **永続化**: `LIST_COL_WIDTHS_LS_KEY = "speccheck.listColWidths.v1"` で `localStorage` に保存 / 復元（`loadListColWidths()`）。
- **リサイズ実装**: `startColResize(colId, e)` が `pointermove` + `pointerup` を window に付与し、`startW + (clientX - startX)` を `minW` でクランプして更新。`pointerdown` 時に `document.body.style.cursor = "col-resize" / userSelect = "none"` で誤選択防止。`resetColWidths()` は全列既定幅へ復帰（ダブルクリック）。
- **レンダリング**:
  - `<table className="text-[11px] w-full" style={{ tableLayout: "fixed" }}>` + `<colgroup>` で各列幅を指定（末尾に `<col />` のスペーサー追加）
  - 各 `<th>` は `border-r border-border/70` で常時見える区切り線、右端 8px 幅の絶対配置ハンドル（`-right-1 w-2 z-20 cursor-col-resize`）の中央に 1px グリップ線（`bg-text-muted/60`、hover/active で `bg-accent` に変化し `w-0.5` に太く）
  - tbody 各 `<tr>` 末尾にも `<td aria-hidden className="p-0" />` スペーサー追加 → 列幅合計が親 `.flex-1 overflow-hidden relative` より小さい時は右側余白として吸収、大きい時は `listRef` の `overflow-auto` で横スクロール
- **ファイル名セル** の `max-w-[200px]` を撤去し `overflow-hidden + truncate` のみ。列幅に完全追従。

### 8. Photoshop ボタンを「Ps」アイコン風に
[SpecCheckView.tsx](src/components/views/SpecCheckView.tsx) 詳細パネルのファイル名ヘッダー
- 単文字 "P" → **"Ps"** に変更。Photoshop 公式配色に寄せて `text-[#31A8FF]` + `border-[#31A8FF]/60`。
- サイズを `w-6 h-6` → `w-[18px] h-[18px]`、角丸 `rounded` → `rounded-[3px]`、文字サイズ `text-sm` → `text-[8px]`、`tracking-tight select-none` 追加。
- 背景色 `bg-[#001E36]` は要望により **無し**。ホバー時のみうっすらシアン（`hover:bg-[#31A8FF]/15`）が乗る。`aria-label="Photoshopで開く"` 追加。

### 9. 「右サブ」「右端」パネル位置ラベルの撤去
[unifiedViewerStore.ts](src/store/unifiedViewerStore.ts) + [UnifiedViewer.tsx](src/components/unified-viewer/UnifiedViewer.tsx)

- **`PanelPosition` 型から `"right-sub"` を削除** → `"far-left" | "left-sub" | "far-right"` の 3 値に。`PANEL_POSITIONS` 配列と `PANEL_POSITION_LABELS` からも削除。
- 既定 `tabPositions` を `text: "right-sub"` → `text: "far-right"` に変更。`setTabPosition` 冒頭で `"right-sub"` が渡されたら `"far-right"` に正規化（永続化されていた旧値の後方互換）。
- UnifiedViewer 側で右側パネルレンダラーが舐めていた `["right-sub", "far-right"]` を `["far-right"]` のみに、校正編集レイアウトの `rightTab` lookup からも `"right-sub"` フォールバックを削除。
- **タブボタン右の位置ラベル** `{PANEL_POSITION_LABELS[pos]}`（「右端」「左サブ」等）を削除、`PANEL_POSITION_LABELS` import も除去。

### 10. 左サイドバーのファイル一覧を削除
[utils.ts](src/components/unified-viewer/utils.ts) + [UnifiedViewer.tsx](src/components/unified-viewer/UnifiedViewer.tsx) + [unifiedViewerStore.ts](src/store/unifiedViewerStore.ts)

- **`ALL_PANEL_TABS` から `files` エントリを削除**（これでタブセレクタに載らない）。未使用になった `Folder` アイコンの import を utils.ts から撤去。
- 既定 `tabPositions` から `files: "far-left"` を削除 → `{ text: "far-right" }` のみ。
- `renderTabContent` から `case "files":`（「フォルダを開く」ボタン + ファイルリストを描画していた JSX）を削除。
- 上部タブセレクタバー左端の **「ファイル展開/格納トグル」ボタン** を削除。
- `ALL_PANEL_TABS.filter` 内の `t.id === "files"` 除外条件を削除（元々入っていないため）。
- `Ctrl+Shift+E` のファイルパネル表示トグルショートカットを削除。
- 左右パネルヘッダ ✕ ボタンの `tab === "files"` 特殊 title / 分岐を削除。
- `useViewerFileOps` の destructure から未使用の `openFolder` を除去。
- 残った `setTabPosition("files", null)` 呼び出しは、localStorage 等に残った古い state を掃除する no-op セーフガードとして保持。

### 11. ホームのカード選択トグル
[PreviewGrid.tsx](src/components/preview/PreviewGrid.tsx)
- 修飾キーなしのクリックで `selectFile(fileId)` を呼んでいた箇所に、**選択中の単一カードを再クリックしたら `clearSelection()`** する分岐を追加。
- 判定条件: `selectedFileIds.length === 1 && selectedFileIds[0] === fileId`。
- Ctrl/Cmd の多選択トグルと Shift の範囲選択は従来どおり、別カードへの選び直しも従来どおり。

### 主要ファイル一覧（この節で追加/変更）
| 区分 | パス | 備考 |
| --- | --- | --- |
| 新規 | [src/components/unified-viewer/panels/TextRearrangeView.tsx](src/components/unified-viewer/panels/TextRearrangeView.tsx) | ProGen 並び替えツールの React 移植 |
| 改修 | [src/components/unified-viewer/utils.ts](src/components/unified-viewer/utils.ts) | `parseTextToChunks` 等 + `ALL_PANEL_TABS` から files 削除 |
| 改修 | [src/components/unified-viewer/panels/TextEditorDropPanel.tsx](src/components/unified-viewer/panels/TextEditorDropPanel.tsx) | 編集/並び替えモード切替 + scoped store |
| 改修 | [src/components/unified-viewer/panels/ProofreadPanel.tsx](src/components/unified-viewer/panels/ProofreadPanel.tsx) | scoped store |
| 改修 | [src/components/unified-viewer/UnifiedViewer.tsx](src/components/unified-viewer/UnifiedViewer.tsx) | 2 層分割 / scoped store / 右サブ撤去 / files UI 削除 / 位置ラベル削除 |
| 改修 | [src/components/unified-viewer/useViewerFileOps.ts](src/components/unified-viewer/useViewerFileOps.ts) | scoped store |
| 改修 | [src/store/unifiedViewerStore.ts](src/store/unifiedViewerStore.ts) | ファクトリ化 / Provider / scoped hooks / 右サブ削除 / files 既定削除 |
| 改修 | [src/components/progen/ProgenProofreadingView.tsx](src/components/progen/ProgenProofreadingView.tsx) | 校正チェック項目 ProGen 準拠 |
| 改修 | [src/components/layout/GlobalAddressBar.tsx](src/components/layout/GlobalAddressBar.tsx) | パス入力バー全撤去、WF 説明バーのみ |
| 改修 | [src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx) | フォルダ階層ツリー撤去 / 並び替えドロップ撤去 / Explorer 風リスト / Ps ボタン |
| 改修 | [src/components/preview/PreviewGrid.tsx](src/components/preview/PreviewGrid.tsx) | カード選択トグル |

---

## Comic-Bridge DEMO リブランド & UI 簡素化 (DEMO 向け整理)

本節はツール名を「Comic-Bridge DEMO」にリブランドした際の一連の UI/UX 簡素化をまとめる。方針は「アイコン中心のコンパクト表示」「ダイアログとエラー経路の統一」「重複パネルの整理」。

### 1. ツール名を「Comic-Bridge DEMO」に変更
- [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json): `productName`（`COMIC-Bridge-Integrated`→`Comic-Bridge DEMO`）、ウィンドウ `title`（`COMIC-Bridge 統合版`→`Comic-Bridge DEMO`）。
- [index.html](index.html): ブラウザ `<title>` を `Comic-Bridge DEMO`。
- [src/components/spec-checker/SpecViewerPanel.tsx](src/components/spec-checker/SpecViewerPanel.tsx): 画面内ウォーターマーク文字を `Comic-Bridge DEMO`。
- 内部識別子（`package.json` の `name`、Rust 側パス／コメント）はストレージ互換のため未変更。

### 2. TopNav の刷新 — ナビ/ツール/データ読み込み
[src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx) + [src/store/settingsStore.ts](src/store/settingsStore.ts)

- **ナビバーボタンをアイコン専用**（`w-7 h-7 flex items-center justify-center`）に変更。`title` 属性でラベルをツールチップとして残す。
- `ALL_NAV_BUTTONS` のうちアイコンがなかった項目に lucide-react アイコンを割当: `layerControl`→`SlidersHorizontal`、`replace`→`Replace`、`compose`→`Combine`、`tiff`→`FileImage`、`split`→`Columns2`、`folderSetup`→`FolderCog`、`requestPrep`→`Package`。
- 新規インストールのデフォルト順序を `["specCheck", "layers", ...]` に変更。既存ユーザー向けに `localStorage` フラグ `comic_bridge_migration_layers_after_home_v1` で「`layers` を `specCheck` の直後へ 1 回だけ移動」するワンタイム・マイグレーションを追加（以降は設定画面で自由に並べ替え可能）。
- **データ読み込みアイコン（テキスト / 作品情報JSON / 校正JSON）をラベルからアイコンに置換**。`FileText` / `FileJson` / `ClipboardCheck`（既にインポート済）＋ `Check` を使用。
  - 読み込み前はグレー背景 (`bg-bg-tertiary`)、読み込み後はブルー背景 (`bg-sky-500/15 text-sky-500`) に統一。角丸長方形 (`h-6 px-1.5 rounded-md`)。
  - 読み込み完了で右隣にチェックマーク（クリックでクリア）。未読み込み時の小さな「○」インジケーターは廃止。
  - `SmallBtn` の props から `cCls` / `bgCls` を除去。色分岐は `loaded` で内部分岐。
- **「読み込みリセット」ボタン**をフォルダから開くボタンの右に追加（`RotateCcw`）。`usePsdStore.clearFiles()` に加えて、`useUnifiedViewerStore` と `useTextEditorViewerStore` の両方の `textContent` / `textFilePath` / `textHeader` / `textPages` / `isDirty`、および作品情報JSON（`fontPresets` / `presetJsonPath`）、校正JSON（`checkData`）を一括クリア。ファイル・テキスト・JSON いずれも空なら `disabled`。
- リセット確認は **Tauri `ask()` で非同期ダイアログ** を使用（`window.confirm` は WebView2 でブロッキングしないケースがあるため）。メッセージ: 「読み込みをリセットします。よろしいですか？」。

### 3. データ読み込みエラーダイアログ
[src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx) + [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json)

- `@tauri-apps/plugin-dialog` の `message()` を `dialogMessage` として import。
- `handleOpenText`: 拡張子 `.txt` 以外 / `read_text_file` 失敗 / 文字列以外 のそれぞれでエラーダイアログ（`kind: "error"`、タイトル「テキスト読み込みエラー」）。ファイルピッカーに「すべてのファイル」フィルタも併設してエラー経路を確認しやすくした。
- `handleJsonSelect`: 拡張子 `.json` 以外 / `JSON.parse` 失敗 / 校正モードで `checks` も配列もない / 作品情報モードで `presets` と `workInfo` が両方ない、いずれもエラーダイアログ（校正/作品情報でタイトルを出し分け）。
- Tauri 2 では `dialog:default` に `message` 系が含まれない環境があるため、`capabilities/default.json` に `dialog:allow-message` / `dialog:allow-ask` / `dialog:allow-confirm` を明示追加。これが未許可だと `message()` は例外を投げず黙って失敗するため、変更後はアプリ再起動が必要。

### 4. ホーム（SpecCheckView）の詳細パネル整理
[src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx) + [src/components/metadata/MetadataPanel.tsx](src/components/metadata/MetadataPanel.tsx)

- 左詳細パネルから **「レイヤー」`CollapsibleSidebarSection`** を除去（後に `LayerSectionPanel` として別形で復活 → 下記）。
- 「原稿仕様」見出しの **左側のテキスト/ドキュメントアイコン**（`icon={<svg …/>}`）を削除。
- `CollapsibleSidebarSection` のトグルボタン式 (`w-full flex items-center gap-1.5 px-3 py-2 …`) を廃止し、常時展開の `div` にインライン化。未使用になった関数定義・「原稿仕様」文字列も併せて削除。
- `MetadataPanel` のトンボあり/なしチップの文言を **「トンボレイヤーあり」「トンボレイヤーなし」** に変更（ラベルが省略されていたので内容が自明化）。
- **最終構成**: `詳細 > ガイド情報 (GuideSectionPanel) → レイヤー情報 (LayerSectionPanel)`。`MetadataPanel`（原稿仕様ブロック）の描画は後に撤去し、import も除去。

### 5. ホームのリスト表示とカード操作
[src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx)

- 上部ツールバーから **リスト/サムネイル切替アイコンボタン** 2 個＋区切り線を削除（サイズドロップダウンで代用）。
- 表のテキスト列の「なし」を **「テキストレイヤーなし」** に（「あり」はそのまま）。
- サムネイル／リスト行の **ダブルクリック→拡大表示 (`setExpandedFile`)** を削除。サムネイル側 `onDoubleClickFile`、リスト行 `onOpenFile` を両方撤去し、`PsdFileListView` の `onOpenFile` prop も削除。フォルダのダブルクリック（階層移動）は別操作のため維持。

### 6. レイヤー構造ビュー（SpecLayerGrid）
[src/components/spec-checker/SpecLayerGrid.tsx](src/components/spec-checker/SpecLayerGrid.tsx) + [src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx)

- レイヤー構造表示は **詳細サイドバーの `LayerSectionPanel` に一元化**。各ファイルカード (`border rounded-xl … bg-bg-secondary/50 hover:bg-bg-secondary/80 …`) は写植仕様（テキストレイヤー詳細）のみを表示。`LayerTree` 描画を各カードから削除。
- `LayerSectionPanel` を `MetadataPanel.tsx` から再 export し、詳細サイドバーの `GuideSectionPanel` の下に配置。
- 試行錯誤の過程で一時追加した「左サイドバー（選択中ファイルの `LayerTree`）」は撤去し、`useState` / `LayerTree` import も整理。カード内の「写植仕様のみ表示」チェックボックス＆`textOnly` state は機能を失ったため削除。
- **グリッド/リスト切替**を追加。ドロップダウン（`グリッド` / `リスト`）を SpecCheckView の上部ツールバー (`flex-shrink-0 px-2 py-1 bg-bg-tertiary/30 border-b border-border/30 flex items-center gap-2`) に配置し、`viewMode === "layers"` のときだけ表示。
- `layerLayoutMode` state は SpecCheckView が保持し、`localStorage` キー `speccheck.layerLayoutMode.v1` と同期。`<SpecLayerGrid layoutMode={layerLayoutMode} />` で props として渡す。`LayerLayoutMode` 型は SpecLayerGrid から export。
- リスト時は新規 `SpecLayerRow` を使用（1 行にファイル名／`nL`／`nT`／主フォント／使用 pt を表示。選択時はアクセントボーダー）。

### 7. ガイド編集モーダル
[src/components/guide-editor/GuideCanvas.tsx](src/components/guide-editor/GuideCanvas.tsx) + [src/components/guide-editor/GuideEditorModal.tsx](src/components/guide-editor/GuideEditorModal.tsx)

- 左下の操作ヒントオーバーレイ (`absolute bottom-2 left-2 z-40 …`) を削除。
- 右下のズーム率オーバーレイを削除し、**モーダルヘッダー「元に戻す」ボタンの左にズーム率を表示**。`GuideCanvas` に `onZoomChange?: (zoom: number) => void` prop を追加し、内部 `zoom` の useEffect で親へ通知。`GuideEditorModal` は `canvasZoom` state を保持し、ヘッダーに `{Math.round(canvasZoom * 100)}%` のピル表示。

### 8. レイヤー制御ビュー
[src/components/views/LayerControlView.tsx](src/components/views/LayerControlView.tsx) + [src/components/layer-control/LayerControlPanel.tsx](src/components/layer-control/LayerControlPanel.tsx)

- **ビューアー（`LayerPreviewPanel`）と上に重ねていた `TextExtractButton` を削除**。未使用 import（`LayerPreviewPanel` / `useOpenInPhotoshop` / `TextExtractButton`）も撤去。設定パネル `LayerControlPanel` は元の `w-[272px] flex-shrink-0 border-r border-border` のサイドバー表示に戻し、右側は空白領域（`flex-1`）。
- `ModeButton` の内部レイアウトを **`flex flex-col items-center justify-center gap-1`** に変更（アイコン上・ラベル下の縦積み）。

### 9. ProGen サイドバー＆プロンプト生成ボタン
[src/components/progen/ProgenRuleView.tsx](src/components/progen/ProgenRuleView.tsx) + [src/components/progen/ProgenAdminView.tsx](src/components/progen/ProgenAdminView.tsx)

- サイドバーのカテゴリ一覧 (`flex-1 overflow-y-auto`) を **3 列グリッドタイル** に再構成。`aspect-square px-1.5 py-2 rounded-lg border` の正方形ボタンに、アイコン（`text-sky-500`）→カテゴリ名→件数 (`active/total`) の縦積み。アクティブ時は `border-accent/40 bg-accent/15 text-accent font-medium`。
- **プロンプト生成ボタン（抽出 / 整形 / 正誤 / 提案）** を拡大 (`px-5 py-2 text-sm rounded-md`) し、lucide-react アイコンを付与: `ScanText` / `Wand2` / `SpellCheck` / `Lightbulb`。

### 10. CompactFileList サイドバーの廃止
[src/components/views/LayerControlView.tsx](src/components/views/LayerControlView.tsx), [src/components/views/SplitView.tsx](src/components/views/SplitView.tsx), [src/components/views/TypsettingView.tsx](src/components/views/TypsettingView.tsx)

- 3 ビューで共通に使われていた `<CompactFileList className="w-52 flex-shrink-0 border-r border-border" />` を全撤去。未使用 import も整理。

### 主要ファイル一覧（この節で追加/変更）
| 区分 | パス | 備考 |
| --- | --- | --- |
| 改修 | [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) | productName / title → Comic-Bridge DEMO |
| 改修 | [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json) | dialog:allow-message / ask / confirm 追加 |
| 改修 | [index.html](index.html) | `<title>` Comic-Bridge DEMO |
| 改修 | [src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx) | ナビ/データボタンのアイコン化、読み込みリセット、エラーダイアログ |
| 改修 | [src/store/settingsStore.ts](src/store/settingsStore.ts) | ALL_NAV_BUTTONS アイコン追加、layers 配置マイグレーション |
| 改修 | [src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx) | 詳細簡素化、原稿仕様/レイヤー切替トグル撤去、リスト/サムネイルボタン削除、DblClick 拡大削除、グリッド/リスト切替追加 |
| 改修 | [src/components/metadata/MetadataPanel.tsx](src/components/metadata/MetadataPanel.tsx) | トンボ表示のラベル化 |
| 改修 | [src/components/spec-checker/SpecLayerGrid.tsx](src/components/spec-checker/SpecLayerGrid.tsx) | カードから LayerTree 除去、SpecLayerRow 追加、layoutMode prop 化 |
| 改修 | [src/components/guide-editor/GuideCanvas.tsx](src/components/guide-editor/GuideCanvas.tsx) | 操作ヒント/ズーム率オーバーレイ削除、onZoomChange 追加 |
| 改修 | [src/components/guide-editor/GuideEditorModal.tsx](src/components/guide-editor/GuideEditorModal.tsx) | ヘッダーにズーム率 pill を表示 |
| 改修 | [src/components/views/LayerControlView.tsx](src/components/views/LayerControlView.tsx) | ビューアー/ファイルリスト削除 |
| 改修 | [src/components/layer-control/LayerControlPanel.tsx](src/components/layer-control/LayerControlPanel.tsx) | ModeButton を縦積み化 |
| 改修 | [src/components/progen/ProgenRuleView.tsx](src/components/progen/ProgenRuleView.tsx) | カテゴリ 3 列タイル化、プロンプトボタン拡大＋アイコン |
| 改修 | [src/components/progen/ProgenAdminView.tsx](src/components/progen/ProgenAdminView.tsx) | カテゴリ 3 列タイル化 |
| 改修 | [src/components/views/SplitView.tsx](src/components/views/SplitView.tsx) | CompactFileList 撤去 |
| 改修 | [src/components/views/TypsettingView.tsx](src/components/views/TypsettingView.tsx) | CompactFileList 撤去 |
| 改修 | [src/components/spec-checker/SpecViewerPanel.tsx](src/components/spec-checker/SpecViewerPanel.tsx) | ウォーターマーク文字列更新 |

### 注意事項
- ダイアログ権限（`dialog:allow-message` 等）は Tauri の capabilities 変更なので、**dev サーバー＋Tauri 再起動**が必須。
- `productName` 変更で生成バイナリ名が変わるため、古い `src-tauri/target` の成果物は一度クリーンにするのが安全。
- `navBarButtons` の 1 回限りリオーダーは `localStorage` キー `comic_bridge_migration_layers_after_home_v1` で制御。再実行したい場合は当該キーを削除してからアプリを起動する。


## v3.x: ホーム画面全面刷新 + MojiQ 互換ダークモード + アニメーション (2026-04-24)

### 概要
起動時画面をダッシュボード型 2 カラムホームに全面刷新。ヘッダーを完全カスタム chrome 化、ダークモードを MojiQ 準拠パレットに移行、画面遷移に方向性のあるスライドアニメーションを導入。PsDesign / MojiQ / Tachimi の UX を横断的に採用。

### 1. 新ホーム画面 (HomeLayout)
[src/components/views/HomeLayout.tsx](src/components/views/HomeLayout.tsx) (新規) + [src/store/psdStore.ts](src/store/psdStore.ts)

- `SpecViewMode` に `"home"` を追加し初期値に。`SpecCheckView` の冒頭で `if (viewMode === "home") return <HomeLayout />`。
- **レイアウト**: `grid grid-cols-1 lg:grid-cols-2 gap-6 p-6` の 2 カラム
  - **左**: モノクロ/カラー + 「N ファイル」 + ○/× カウンター + 詳細▶ / 大きなサムネ&ドロップゾーン (`flex-1 min-h-[240px] rounded-2xl border-2 border-dashed`) / ワークフロー▶ 大ボタン (`PlayCircle` アイコン + `text-lg font-bold`)
  - **右**: Chrome 風タブ（すべて / 入稿 / 初稿確認 / 差し替え / TIFF化）+ タイルグリッド（`ALL_NAV_BUTTONS` から specCheck を除く）+ 下部 4 アクション（ガイドを編集 / PDF化 / 簡易スキャン / テキスト抽出）
- サムネは `useHighResPreview(firstFile.filePath, { maxSize: 1200 })` で詳細表示と同等画質。`thumbnailStatus === "pending"/"loading"` でスピナー、hover で「フォルダを変更」オーバーレイ。
- **カラーモード自動判定**: 読込時に PSD の `metadata.colorMode` を集計し、多数派（Grayscale → mono-spec / RGB・CMYK → color-spec）を `selectSpecAndCheck` で自動アクティブ化。`autoSelectedFolderRef` で同一フォルダにつき 1 回だけ判定、ユーザー手動切替を尊重。
- HomeLayout 内でも `useSpecChecker()` を呼び、○/× バッジが読込時に自動更新。
- PSD 未読込時はモノクロ/カラートグルを `opacity-40 pointer-events-none` でグレーアウト。

### 2. ホームアクション 4 ボタン集約
[src/components/views/HomeLayout.tsx](src/components/views/HomeLayout.tsx) + [src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx)

- 従来 `SpecCheckView` の浮動アクションバーにあった **ガイドを編集 / PDF化 (Tachimi) / 簡易スキャン / テキスト抽出** をホーム右カラムの最下部 `grid grid-cols-4 gap-2` に集約。Tachimi 風 `bg-bg-secondary border-2 border-border` のグレー統一配色。
- `TextExtractButton` は外部コンポを改変せず、ラッパー div の `[&>div>button]:!border-border` Tailwind arbitrary variant で色を上書きしつつ `w-full` を注入。PSD 未読込時はプレースホルダ ActionButton を表示し 4 列レイアウトを維持。
- `handleLaunchTachimi` / `showScanJsonInPanel` / `tachimiError` state を HomeLayout に複製。SpecCheckView には `FileContextMenu` 経由の `onLaunchTachimi` が残るため `tachimiError` 固定トーストのみ残置。

### 3. 画面遷移アニメーション
- HomeLayout: `exitDirection: "none" | "toDetail" | "toTile"` state で方向管理。`transition-all duration-300 ease-in` で 300ms 後に実際の state 切替。
  - **ホーム → 詳細**: `-translate-x-8 opacity-0`（左スライド + フェード）
  - **ホーム → タイル**: `-translate-y-8 opacity-0`（下 → 上スライド）
- SpecCheckView: `isExitingToHome` state で **右スライド**（`translate-x-8 opacity-0`）。詳細モノクロ/カラー行の左端に `Home` アイコン付き「ホーム」ボタンを追加、クリックで `goToHome()` → 300ms 後に `setSpecViewMode("home")`。
- ワークフロー/データボタン/タイル連打ガード付き。

### 4. ヘッダー (TopNav) 全面再構成 + カスタムウインドウコントロール
[src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx) + [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) + [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json)

- **Tauri `decorations: false`** に切替、完全カスタム chrome 化。capabilities に `core:window:allow-minimize` / `allow-toggle-maximize` / `allow-is-maximized` / `allow-close` を追加。
- **最小横幅**: `minWidth: 1000 → 1200`。ヘッダー高さ `h-14 → h-10`。
- **アプリアイコン**: `/app-icon.png`（`src-tauri/icons/32x32.png` を `public/` に複製）を左端に配置。
- **ヘッダー右端のウインドウコントロール**（`WindowControls` コンポーネント、ファイル末尾）: 最小化 / 最大化トグル（`isMaximized` を `onResized` で監視し `□` ↔ `❐` を切替）/ 閉じる（hover 時 `#e81123` 赤塗り）。
- 並び順: `[アイコン][ホーム][ツール][│区切り][設定/フォルダから開く/読み込みリセット][テキスト/作品情報JSON/校正JSON] ... [flex-1] [更新バッジ][― □ ×]`
- **廃止**: WorkflowBar コンポーネント（header 左端の WF ボタン）、NavBarButtons の配置（本体はコンポとして残置）、ファイル数+OK/NG カウンターの TopNav 右側表示（ホーム側に集約）。

### 5. ツールボタン ドロップダウン（PsDesign save-menu 準拠）
[src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx) の `TopNavToolMenu`

- 挙動: **ホバー開閉**（`onMouseEnter` で即開、`onMouseLeave` で 300ms ディレイ閉）。
- 見た目: 上向き三角（CSS border-trick 2 枚重ね、外枠 `--cb-border-color` + 内塗り `--cb-menu-bg` で light/dark 自動切替）、`shadow-[0_8px_24px_rgba(0,0,0,0.35)]`、`min-w-[220px] max-h-[35vh]`、overflow-auto は内側スクロール領域にだけ付けて三角のクリップを回避、三角の left 位置はボタン中心に合わせて `left-2`。
- 内容: **ツール**（`ALL_NAV_BUTTONS` から specCheck を除いた 13 項目、ホーム右タイルグリッドと同一）+ **ProGen**（抽出/整形/校正）+ **検版ツール**（差分/分割、`Shield` アイコン）。セクションヘッダーに `border-b border-border mb-1` で区切り。

### 6. 読み込みリセット カスタムダイアログ（赤基調）
[src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx)

- 旧 Tauri `ask()` を廃止し、`createPortal` で自前モーダル。警告三角アイコン + タイトル「読み込みリセット」+ 説明文 + キャンセル/リセット ボタン。
- 全体を `border-error/30` / `bg-error/15` / `text-error` / `bg-error shadow-error/30` の **赤基調**で「危険操作」を表現。
- `performReset` で PSD / テキスト / 作品情報JSON / 校正JSON に加え `useSpecStore.clearCheckResults()` / `clearConversionResults()` / `setCurrentFolderPath(null)` も実行。

### 7. 設定パネル
[src/components/layout/SettingsPanel.tsx](src/components/layout/SettingsPanel.tsx)

- **「ナビ/ツール配置」タブを完全削除**。関連 state（`editNav` / `editTool` / `dragTarget` / `dragOverIdx`）とドラッグ並べ替えロジック、`renderCombinedList` / `getPreviewList` / `startDrag` / `toggleItem` / `applyLayout` をすべて撤去。単一タブになったのでタブバー自体も廃止。
- `settingsStore` の `navBarButtons` / `toolMenuButtons` フィールドは保持（TopNav の NavBarButtons / TopNavToolMenu が参照するデフォルト値として）。

### 8. MojiQ Pro_1.0 互換ダークパレット
[src/styles/globals.css](src/styles/globals.css) + [src/components/layout/AppLayout.tsx](src/components/layout/AppLayout.tsx)

- **旧 `filter: invert(1) hue-rotate(180deg)` トリックを完全撤廃**（画像/Canvas/iframe への counter-filter 含む）。画像・PSD プレビューは常に自然な色で表示。
- MojiQ Pro_1.0 (`C:\Users\noguchi-kosei\Desktop\MojiQ_開発\MojiQ Pro_1.0\src\App.css`) の dark-theme 変数に揃えた MojiQ 互換パレットを `html.dark-mode-invert` スコープで Tailwind 静的色クラスに上書き:
  - bg: `#1e1e1e` / `#2c2c2c` / `#3c3c3c` / `#4c4c4c`
  - text: `#f6f6f6` / `#aaaaaa` / `#888888`
  - border: `#444444` / `#555555`（opacity variant /20 /30 /40 /50 も含む）
  - accent: `#0078d4`
- `bg-bg-*` / `text-text-*` / `border-border*` の基底に加え **`hover:*` / `group-hover:*` / `focus:*` / `active:*` のバリアントもすべて上書き**。スクロールバー（track `#2c2c2c` / thumb `#4c4c4c`）、`.bg-tone` もダーク対応。
- `:root` / `html.dark-mode-invert` に `--cb-border-color` / `--cb-menu-bg` を定義し、ドロップダウン三角のような JSX インライン style も自動で light/dark 切替。

### 9. ProGen ルール編集ビュー
[src/components/progen/ProgenRuleView.tsx](src/components/progen/ProgenRuleView.tsx) + [src/components/views/ProgenView.tsx](src/components/views/ProgenView.tsx)

- 上部バー (`flex-shrink-0 px-3 py-2 border-b … bg-bg-tertiary/20`) を整理:
  - 4 プロンプト生成ボタン（抽出/整形/正誤/提案）と「コピー済」バッジを削除
  - 左端に **テキストエディタへジャンプ** ボタン（`FileEdit` icon、`useViewStore.getState().setActiveView("textEditor")`）
  - 右寄せの `TextSourceDropdown` / `ResultPasteDropdown` は維持
- コンテンツ (`flex-1 overflow-auto p-3`) の直下に **`grid grid-cols-4 gap-3 h-14`** の大きな横一列で 4 プロンプト生成ボタンを再配置。青/緑/橙で色分け、`rounded-xl shadow-sm active:scale-[0.98]`。
- ProgenView の `absolute bottom-4 … z-30` の WF フローティングポップアップを完全削除（240 行超）。`hasText` / `wfProgenMode` / `wfCheckMode` / `toolMode` 等の関連 state・不要 import（`AlertTriangle` / `Lightbulb` / `Pencil`）も撤去。`text-sm font-bold` のタイトル行も削除。

### 10. ワークフローボタン ホバーシャイン
[src/styles/globals.css](src/styles/globals.css) + [src/components/views/HomeLayout.tsx](src/components/views/HomeLayout.tsx)

- Tachimi Standalone (`C:\Users\noguchi-kosei\Desktop\Tachimi_開発\Tachimi-_Standalone`) の `.btn-execute::before` 手法を移植し、`.btn-shine` ユーティリティクラスとして globals.css に実装。
- 挙動: **ホバー時のみ** `::before` の斜め 45° 白ハイライト（`rgba(255,255,255,0.28)` 中央）が `translateX(-100% → 100%)` に **1.6s ease-out** で片道スイープ。opacity を `0 → 1 → 1 → 0` で両端フェード。
- 旧 `hover:-translate-y-0.5 hover:shadow-elevated`（動き + 影強化）を撤廃。ラベル/アイコンは `<span className="relative z-[1]">` で前面に。
- `disabled` / `aria-disabled="true"` では `::before { display: none }` で光を停止。

### 主要変更ファイル一覧（この節で追加/変更）
| 区分 | パス |
| --- | --- |
| 新規 | [src/components/views/HomeLayout.tsx](src/components/views/HomeLayout.tsx) |
| 新規 | [public/app-icon.png](public/app-icon.png)（`src-tauri/icons/32x32.png` を複製） |
| 改修 | [src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx) — アプリアイコン / ウインドウコントロール / カスタムリセット / ツールドロップダウン |
| 改修 | [src/components/layout/WorkflowBar.tsx](src/components/layout/WorkflowBar.tsx) — `executeStepNav` / `ProofLoadOverlay` を export |
| 改修 | [src/components/layout/AppLayout.tsx](src/components/layout/AppLayout.tsx) — ダークモードのコメント更新 |
| 改修 | [src/components/layout/SettingsPanel.tsx](src/components/layout/SettingsPanel.tsx) — 「ナビ/ツール配置」タブ削除 |
| 改修 | [src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx) — home mode 分岐 / 戻る遷移 / 4 ボタン移設 |
| 改修 | [src/components/views/ProgenView.tsx](src/components/views/ProgenView.tsx) — フローティングポップアップ削除 |
| 改修 | [src/components/progen/ProgenRuleView.tsx](src/components/progen/ProgenRuleView.tsx) — 上部バー整理・下部 4 ボタン |
| 改修 | [src/store/psdStore.ts](src/store/psdStore.ts) — `SpecViewMode` に `"home"` 追加、初期値変更 |
| 改修 | [src/styles/globals.css](src/styles/globals.css) — MojiQ ダークパレット / btn-shine / CSS 変数 |
| 改修 | [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) — `decorations: false` / `minWidth: 1200` |
| 改修 | [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json) — window permission 追加 |

### 注意事項
- `decorations: false` と capabilities の変更は Tauri アプリの再ビルド/再起動が必要。
- MojiQ 互換ダーク化で filter 反転を廃止したため、ダーク時に色味が大きく変わる。`dark-mode-invert` クラス名は互換性のため据え置き。
- `specViewMode` 初期値を `"home"` に変更したため、既存ユーザーも起動時はホームから始まる（`localStorage` での永続化はなし）。
- `WorkflowBar` コンポは `executeStepNav` / `ProofLoadOverlay` を外部から再利用するため `export` 化済み。本体のバー UI は TopNav から削除されているが、HomeLayout のワークフロー▶ ピッカーから間接的に呼ばれる。

---

## v3.x: アクセントカラー設定連動 + iOS 風メタリックボタン + 画面遷移アニメーション統一

本節は「アクセントカラーの動的化」「全ボタンの iOS 風メタリック仕上げ」「ホーム ↔ ワークフロー遷移アニメ」「ホーム画面タブの slide pill 化」「レイヤー制御の color 統一」の一連の整理をまとめる。

### 1. アクセントカラーを設定パネルから動的に変更可能に
従来 `tailwind.config.js` に固定値（`#3a7bd5`）として焼き込まれていた `accent` トークンを **CSS 変数経由** に書き換え、`settingsStore.accentColor` の変更が即座にアプリ全体に反映されるようにした。

**新規:** [src/lib/colorUtils.ts](src/lib/colorUtils.ts)
- `hexToHsl()` / `hslToHex()` / `hexToRgba()` / `hexToRgbTriplet()` の純粋関数
- `deriveAccentPalette(baseHex)` — 基準色から hover (`-10% lightness`) / tertiary (`+6%`) / warm (`-14% L, -8% S`) を機械的に派生 + `glow` (`alpha 0.20`)

**改修:** [tailwind.config.js](tailwind.config.js#L28-L37)
- `accent.{DEFAULT,hover,secondary,tertiary,warm}` を `rgb(var(--cb-accent-*-rgb) / <alpha-value>)` 形式に変更（`bg-accent/15` 等の opacity モディファイア対応のため RGB triplet + alpha placeholder）
- `accent.glow` のみ完全な rgba 文字列（`var(--cb-accent-glow)`）

**改修:** [src/styles/globals.css](src/styles/globals.css)
- `:root` に `--cb-accent-rgb: 58 123 213` などスペース区切りの RGB triplet 5 つ + `--cb-accent-glow` を追加
- `html.dark-mode-invert` スコープから `bg-accent` / `text-accent` / `border-accent` / `hover:*-accent` / `group-hover:*-accent` / `focus:border-accent` 系の固定値上書きを **撤去**（CSS 変数経由になったので不要）

**改修:** [src/components/layout/AppLayout.tsx](src/components/layout/AppLayout.tsx#L33-L66)
- ダークモード切替の useEffect とは別に、`accentColor` 変更時に `deriveAccentPalette` → `hexToRgbTriplet` で 5 つの triplet + glow を `document.documentElement.style.setProperty("--cb-accent-*-rgb", ...)` する useEffect を追加
- 旧 `--settings-accent`（未配線）の処理は削除

**改修:** [src/store/settingsStore.ts](src/store/settingsStore.ts#L124)
- `accentColor` 初期値を `#7c5cff`（旧パープル）→ **`#3a7bd5`（標準ブルー）** に

**改修:** [src/components/layout/SettingsPanel.tsx](src/components/layout/SettingsPanel.tsx)
- `ACCENT_COLORS` 配列を 8 → 9 色に再構成、先頭を「ブルー（標準）`#3a7bd5`」、末尾に「ダークグレー `#52525b`」を追加
- 「※カラー変更は今後対応予定」注記を削除

### 2. レイヤー制御パネルの操作色を accent に統一
[LayerControlPanel.tsx](src/components/layer-control/LayerControlPanel.tsx) のモードボタンとモード内 UI の色をすべて accent 系に揃えた（モード固有の violet/sky/amber/emerald 配色を撤廃）。

- **ModeButton (6 モード)**: hide=`bg-accent`、show=`bg-accent-tertiary`、その他（layerMove/custom/lock/merge）も全て `bg-accent text-white` に統一
- **lockBottomLayer / unlockAllLayers** チェックボックス: amber → accent、sky → accent
- **layerMove モード**: violet → accent、`focus:border-violet-500` → `focus:border-accent` (3 箇所)
- **整理モード「白消し・棒消しも含む」**: warning (オレンジ) → accent、`focus:border-warning` → `focus:border-accent`
- **merge モード「テキスト整理」**: emerald → accent
- **custom モードのサマリ**: `bg-sky-400` / `bg-violet-400` → `bg-accent` / `bg-accent-tertiary`
- **native HTML radio/checkbox** の `accent-violet-500` → `style={{ accentColor: "rgb(var(--cb-accent-rgb))" }}` で CSS 変数連動化（3 箇所）

注: PSD レイヤータイプアイコン色（`#f06292` 等）、警告系 `text-amber-500`、Photoshop ブランド `[#31A8FF]` などの **意味色** は意図的に維持。

### 3. iOS 風メタリックボタン効果（全 button 自動適用）
700+ 件のボタンを個別書き換えせず、`globals.css` のグローバル CSS だけで全 `<button>` に **縁ハイライト + 上下グラデ + 押下感** を乗せる方針。

**実装** ([globals.css](src/styles/globals.css)):
```css
button { position: relative; isolation: isolate; transition: transform 0.12s, filter 0.15s; }

/* グラデーション overlay（ガラス感） */
button:not(.no-glass):not(.btn-shine)::before {
  inset: 0; pointer-events: none; border-radius: inherit;
  background: linear-gradient(180deg,
    rgba(255,255,255,0.32) 0%,
    rgba(255,255,255,0.08) 45%,
    rgba(0,0,0,0.04) 100%);
}
/* 縁ハイライト */
button:not(.no-glass):not(.btn-shine)::after {
  inset: 0; pointer-events: none; border-radius: inherit;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(0,0,0,0.10);
}
/* hover で brightness up、active で scale-down */
button:not(.no-glass):...:hover  { filter: brightness(1.05); }
button:not(.no-glass):...:active { transform: scale(0.97); filter: brightness(0.95); }
```

**設計判断**:
- 透明背景の icon-only ボタンには半透明オーバーレイがほぼ見えないので副作用なし
- `.btn-shine` は別アニメ優先のため擬似要素から除外（メタリックは inset shadow 直接付与で実現、後述）
- `.no-glass` でオプトアウト可能。WindowControls 3 ボタン（最小化/最大化/閉じる）に適用 — 閉じるボタンの `#e81123` 赤 hover を綺麗に保つため
- ダークモード: `html.dark-mode-invert` スコープでハイライトを 0.55 → 0.10 に弱め、下方シャドウを 0.10 → 0.25 に強めて統一感

**初期値はライトで控えめ → ユーザーフィードバックで大幅強化**:
- 上端ハイライト 0.22 → **0.55** (2.5 倍)、グラデ上端 0.14 → 0.32 (2 倍超)
- 下端に微かな暗色 (`rgba(0,0,0,0.04)`) を加えて「光って沈む」金属感

### 4. ワークフロー▶ボタンのメタリック仕上げ
`.btn-shine` 自身に inset shadow + outer accent glow を直接当てて、iOS の Tinted Button 風の質感に。

**実装** ([globals.css](src/styles/globals.css)):
```css
.btn-shine {
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.55),         /* 上端の白い縁 */
    inset 0 -1px 0 rgba(0,0,0,0.18),              /* 下端の暗縁 */
    inset 0 -12px 22px -10px rgba(0,0,0,0.20),    /* 内側下方の暗影 = お椀型 */
    0 8px 20px -4px rgba(var(--cb-accent-rgb), 0.45),  /* outer glow（accent 連動） */
    0 2px 4px rgba(0,0,0,0.08);                   /* drop shadow */
}
.btn-shine:hover { /* glow と暗影を強化 */ }
html.dark-mode-invert .btn-shine { /* ハイライト弱め、暗影強め */ }
```

- `rgba(var(--cb-accent-rgb), 0.45)` でアクセントカラー切替時に glow も追従
- 既存の `:hover::before` 白いスイープアニメと共存（box-shadow vs ::before）

### 5. 画面遷移アニメーション 2 種（exit-to-home + enter-from-back）
**問題:** 当初 SpecCheckView 親 div に `transition: scale + opacity + blur` を適用していたが、ユーザーが押す「ホーム」ボタンは TopNav の HomeNavButton（**SpecCheckView 外**）で、SpecCheckView がそもそもマウントされていない別ビュー（unifiedViewer 等）から戻るケースで親 div のアニメは効かなかった。

**解決:** ViewRouter ラッパー div に `@keyframes` ベースのアニメ class を付与する方式に再設計。

**実装** ([globals.css](src/styles/globals.css)):
```css
/* ホームへ戻る: 手前 → 奥へフェードアウト */
@keyframes exit-to-home {
  0%   { transform: scale(1);    opacity: 1; filter: blur(0px); }
  100% { transform: scale(0.6);  opacity: 0; filter: blur(6px); }
}
.animate-exit-to-home { animation: exit-to-home 380ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }

/* ワークフロー入場: 奥 → 手前へズームイン */
@keyframes enter-from-back {
  0%   { transform: scale(0.65); opacity: 0; filter: blur(6px); }
  100% { transform: scale(1);    opacity: 1; filter: blur(0px); }
}
.animate-enter-from-back { animation: enter-from-back 420ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
```

**実装** ([viewStore.ts](src/store/viewStore.ts)):
```ts
isExitingHome: boolean;
isEnteringWorkflow: boolean;

goToHomeWithExit: () => {
  // 動的 import で psdStore と循環依存回避
  // 既にホーム表示中ならスキップ
  set({ isExitingHome: true });
  setTimeout(() => {
    set({ activeView: "specCheck", isExitingHome: false });
    psd.setSpecViewMode("home");
  }, 380);
},
triggerWorkflowEnter: () => {
  set({ isEnteringWorkflow: true });
  setTimeout(() => set({ isEnteringWorkflow: false }), 420);
},
```

**実装** ([ViewRouter.tsx](src/components/layout/ViewRouter.tsx)):
```tsx
<div className={`flex-1 overflow-hidden bg-bg-primary relative ${
  isExitingHome ? "animate-exit-to-home"
  : isEnteringWorkflow ? "animate-enter-from-back" : ""
}`}>
```

**呼び出し箇所**:
- TopNav の HomeNavButton + NavBar specCheck onClick → `useViewStore.getState().goToHomeWithExit()`
- SpecCheckView 内の「ホーム」ボタン → 同上
- HomeLayout の `handleSelectWorkflow` → `useViewStore.getState().triggerWorkflowEnter()` を `startWorkflow(wf)` 直後に呼ぶ

**重要:** CSS `transition` 方式は React の re-render と値変化検知が噛み合わずスキップされるケースがある（特に Tailwind の `--tw-scale-x` 経由）。`@keyframes animation` 方式はクラス付与の瞬間に必ず実行されるためタイミング問題が起きない。

### 6. ホーム画面タブのスライディング pill
[HomeLayout.tsx](src/components/views/HomeLayout.tsx) の Chrome 風タブ（すべて / 入稿 / 初稿確認 / 差し替え / TIFF化）を **絶対配置の pill が左右にスライド** する方式に書き換え。

**実装**:
- `tabsContainerRef` + `tabRefs.current[id]` で各タブ button の `getBoundingClientRect()` を計測
- `useEffect` + `ResizeObserver` で `activeTileTab` 変化時 + リサイズ時に `tabPillStyle = { left, width, ready }` を更新
- pill = `<div className="absolute bottom-0 -mb-px bg-bg-secondary border border-b-0 border-border rounded-t-lg transition-all duration-300 ease-out" style={{ left, width, top: "0.25rem" }} />`
- pill 背景色 = `bg-bg-secondary`（コンテンツパネルと同色）+ `rounded-t-lg` + `border-b-0` でパネルとシームレスに繋がる「同化」表現
- 各 tab button は `bg-transparent` + `no-glass`（pill の上に乗るのでガラス効果は除外）

切替時に pill が 300ms かけて `ease-out` で横スライドし、選択中タブは下のコンテンツパネルと同一面のように見える。

### 7. その他の細かい改修
- **設定ダイアログ右上 ×ボタン削除** ([SettingsPanel.tsx](src/components/layout/SettingsPanel.tsx)) — フッターの「閉じる」ボタンと背景クリック / Escape で代替可能
- **設定パネルのバージョン表示** `v0.0.0` → **`Ver 0.0.0`**（大文字 + スペース）
- **SpecCheckView 下部の白背景装飾 div 削除** — `pointer-events-none absolute bottom-0 bg-white border-t border-border z-[5] h-16 ...` の純粋装飾要素を撤去

### 主要変更ファイル一覧
| 区分 | パス |
|---|---|
| 新規 | [src/lib/colorUtils.ts](src/lib/colorUtils.ts) — HSL 変換 + 派生パレット |
| 改修 | [tailwind.config.js](tailwind.config.js) — accent を CSS 変数化 |
| 改修 | [src/styles/globals.css](src/styles/globals.css) — `:root` accent 変数 / iOS 風 button 擬似要素 / btn-shine メタリック / exit-to-home + enter-from-back keyframes / dark accent 上書き撤去 |
| 改修 | [src/components/layout/AppLayout.tsx](src/components/layout/AppLayout.tsx) — accentColor → CSS 変数更新 useEffect |
| 改修 | [src/components/layout/SettingsPanel.tsx](src/components/layout/SettingsPanel.tsx) — 9 色プリセット / ×ボタン削除 / Ver 表記 |
| 改修 | [src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx) — HomeNavButton / NavBar specCheck onClick を `goToHomeWithExit()` に統一、WindowControls 3 ボタンに `no-glass` |
| 改修 | [src/components/layout/ViewRouter.tsx](src/components/layout/ViewRouter.tsx) — ラッパー div に exit/enter アニメ class |
| 改修 | [src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx) — `goToHome` を viewStore 経由に / 「ホームへ戻る」ボタンの inline transition 削除 / 下部白背景 div 削除 |
| 改修 | [src/components/views/HomeLayout.tsx](src/components/views/HomeLayout.tsx) — タブ pill (ResizeObserver で位置追従) / `triggerWorkflowEnter()` 呼出 |
| 改修 | [src/components/layer-control/LayerControlPanel.tsx](src/components/layer-control/LayerControlPanel.tsx) — モードボタン + 各モード内 UI の色を accent 系に統一、native input は CSS 変数連動 |
| 改修 | [src/store/viewStore.ts](src/store/viewStore.ts) — `isExitingHome` / `isEnteringWorkflow` state + `goToHomeWithExit()` / `triggerWorkflowEnter()` action |
| 改修 | [src/store/settingsStore.ts](src/store/settingsStore.ts) — `accentColor` 初期値を `#3a7bd5` に |

### 注意事項
- アクセントカラー追加時は `accent` トークンの派生（hover/secondary/tertiary/warm/glow）が `colorUtils.deriveAccentPalette` の HSL 変換で機械的に生成される。基準色さえ指定すればパレット全体が自動構成される
- `.no-glass` を新規ボタンで使う場面はほぼない（透明 / icon-only でも副作用なし）。例外は WindowControls のように特定の hover 色（赤 #e81123 等）を綺麗に出したい場合のみ
- `goToHomeWithExit()` / `triggerWorkflowEnter()` は **どこからでも呼べる**（zustand store action）。新規にホーム遷移 UI を作る場合は必ず `goToHomeWithExit()` を経由させること
- ホームから別ビューへ遷移するアニメは現状 enter-from-back のみ。ワークフロー以外で「奥 → 手前」の演出が必要なら `triggerWorkflowEnter()` を流用するか、新規 keyframe を追加

---

## DEMO 環境再構成: GitHub プル → _backup から UI 一式を反映 (2026-04-25)

### 概要
DEMO リポジトリ (`noguchi-kosei-del/Comic-Bridge-DEMO`) を `C:\Users\noguchi-kosei\Desktop\Comic-Bridge DEMO\` にプル後、隣接 `_backup/` に保存されていた 2026-04-24 の UI/アニメーション一連の改修 (前 2 セクション) を反映させた作業ログ。

### 1. 初期セットアップ
- 既存の `_backup/` と `Desktop.ini` が残るディレクトリに `git init` → `remote add origin` → `git pull origin main` でリポジトリを初期化
- ローカルブランチを `master` → `main` にリネームし、`origin/main` を tracking
- `start-dev.bat` 起動時に pdfium ダウンロード後の存在チェックで失敗 (curl は成功しコピーも echo されるが post-check で失敗) → `_backup/src-tauri/resources/pdfium/pdfium.dll` をコピーして回避。以降のステップは `:download_pdfium` サブルーチンをスキップ

### 2. _backup から反映した変更
- **`src/` 全体を wholesale 置換**: 19 変更ファイル + 新規 2 ファイル (`src/lib/colorUtils.ts`, `src/components/views/HomeLayout.tsx`)
- **`tailwind.config.js`** (accent CSS 変数化版)
- **`CLAUDE.md`** (最新ドキュメント同期)

### 3. DEMO 識別子保持のため触らなかったファイル
- `src-tauri/tauri.conf.json` — DEMO の updater endpoint (`noguchi-kosei-del/Comic-Bridge-DEMO`) と pubkey、`version: "1.0.1"` を維持。UI 関連フィールド (`decorations: false`, `minWidth: 1200`, `productName: "Comic-Bridge DEMO"`, capabilities の window permission 等) は既に DEMO 版に取り込まれていたため変更不要
- `package.json` — `version: "1.0.1"` 維持 (deps は `_backup` と完全一致)
- `package-lock.json` — `npm install` 実行で版数が `3.8.1 → 1.0.1` に正常同期 (これはコミット対象)
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` — version のみ差分、依存解決に変更なし
- `src-tauri/src/` — Rust ソース不変
- `src-tauri/capabilities/default.json` — 完全同一
- `start-dev.bat` — byte-identical

### 4. .gitignore 追加
ローカル作業領域を誤コミットしないため:
```
_backup/
.claude/
```

### 5. リリース構成 (DEMO 環境)
- リリース CI: [.github/workflows/release.yml](.github/workflows/release.yml) `on: push: tags: 'v*'` で発火、`tauri-apps/tauri-action@v0.5` 使用
- PDFium 自動ダウンロードステップ込み (line 38-52)
- 必要 secrets: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (DEMO リポジトリに設定済み — v1.0.0 / v1.0.1 が既にリリース実績あり)
- リリース手順は通常版と同じ: `package.json` / `tauri.conf.json` / `Cargo.toml` の 3 ファイルを同一バージョンに更新 → コミット → `git tag vX.X.X && git push origin vX.X.X` で CI 起動

### 6. 既知の癖
- `start-dev.bat` の pdfium ダウンロード処理は環境依存で post-check に失敗するケースあり。`pdfium.dll` を手動配置 or `_backup` から流用すれば `if not exist "%PDFIUM_DLL%"` の最初のガードでスキップされる
- 古い `package-lock.json` が `version: "3.8.1"` (上流) のまま残っていたが `npm install` で `1.0.1` に修正済

---

## v1.0.3: ホームタイル個別ホバーアニメ + ドロップゾーン演出 + ヘッダー修正 (2026-04-25)

### 1. ホームタイルアイコンの個別ホバーアニメーション
[HomeLayout.tsx:472](src/components/views/HomeLayout.tsx#L472) のツールタイルグリッド内 `<Icon>` に `icon-anim-{btn.id}` クラスを連結し、[globals.css 末尾](src/styles/globals.css) に各 id 用 keyframe + `.group:hover` ルール + `prefers-reduced-motion` ガードを追加。各ツールのメタファに合わせた個別アニメ:

| btn.id | アイコン | 動き | keyframe |
|---|---|---|---|
| `unifiedViewer` | Eye | scaleY で縦方向まばたき | `icon-blink` |
| `inspection` | Shield | 内側に fill が緩やかに入って抜ける（`fill-opacity: 0 → 0.5 → 0`） | `icon-fill` |
| `progen` | Sparkles | 拡大 + 軽い回転（きらめき、ループ） | `icon-twinkle` |
| `textEditor` | FileEdit | **左下のペン (`:nth-child(3)`) のみ** が自身の中心軸でゆらゆら振動 | `icon-wiggle` |
| `scanPsd` | ScanLine | scale(0.4) + opacity 0 から徐々に拡大しフェードして手前に近づく | `icon-zoom-in` |
| `layers` | Layers | ダイヤ部分は静止、下の 2 本の線が上 → 下の順に出現 | `icon-layer-line-1/2` |
| `layerControl` | SlidersHorizontal | 左右にスライド（ループ） | `icon-slide-h` |
| `replace` | Replace | 上の□のコーナー線 (1-4) と下の□ (rect) が逆位相に交互ブリンク | `icon-blink-a/b` |
| `compose` | Combine | 右向き矢印 (`:nth-child(3,4)`) が左から現在位置に緩やかにスライドイン | `icon-arrow-enter-l` |
| `tiff` | FileImage | Y 軸 180° フリップ（perspective: 600px で立体感） | `icon-flip` |
| `split` | Columns2 | scaleX で開閉（ループ） | `icon-pull-apart` |
| `folderSetup` | FolderCog | **歯車部分（`:not(:first-child)` = 歯 + 中心 circle）のみ** が viewBox 座標 (18, 18) を中心に 360° 回転、フォルダ本体は静止 | `icon-rotate` |
| `requestPrep` | Package | バウンド | `icon-bounce` |

### 2. ドロップゾーン D&D 演出強化 ([HomeLayout.tsx](src/components/views/HomeLayout.tsx))
**問題**: 既存の HTML5 `onDragOver`/`onDragLeave` は **Tauri webview では発火しない**ため、`isDragOver` state が更新されず見た目が変化しなかった。

**修正**: `getCurrentWindow().onDragDropEvent` を購読し、`event.payload.position` を `dropZoneRef.current.getBoundingClientRect()` と DPR 補正付きで比較してドロップゾーン内外を判定。`over` で内側なら `setIsDragOver(true)`、`leave` / `drop` で `setIsDragOver(false)`。

ドラッグ中の見た目:
- 外枠: `border-accent` + `bg-accent/15` + `ring-4 ring-accent/30` + `shadow-elevated shadow-accent/20`（青枠強調 + ふんわり青グロー）
- フォルダアイコン容器: `transition-all duration-500 ease-out` で `scale-100 → scale-125`、`bg-bg-tertiary → bg-accent/20`、`shadow-elevated shadow-accent/40`（奥から手前へ近づく演出）
- Folder アイコン本体: `text-folder → text-accent` で色変化

### 3. TopNav ホームボタン押下時の青いライン修正 ([TopNav.tsx](src/components/layout/TopNav.tsx))
**問題**: ホームボタンを押すと一瞬だけ青い線が出てしまう。

**根本原因**: [globals.css:152-161](src/styles/globals.css#L152-L161) の `nav button.text-text-secondary:focus::after` ルールが、`text-text-secondary` を持つボタンに focus 時、青い 2px ライン（`background: #3a7bd5`、`bottom: -6px`）を疑似要素で描画していた。設定ボタン・フォルダ選択ボタンは `text-text-muted` を使っているため発火しない。

**修正**: `HomeNavButton` および `NavBarButtons` の inactive 状態クラスを `text-text-secondary` → **`text-text-muted`** に変更し、設定ボタン等と挙動を完全にそろえた。`.blur()` 呼び出しや `focus-visible:outline-none` ハック、グローバル `nav button:focus { outline: none !important }` など試行的に追加した防御的コードはすべて撤去。

### 4. ツールドロップダウン ProGen セクション見出しにアイコン追加 ([TopNav.tsx](src/components/layout/TopNav.tsx))
ツールドロップダウン (`TopNavToolMenu`) の「ProGen」セクション見出しに `Sparkles`（✨）アイコンを `w-3 h-3` で追加。検版ツール（`Shield`）と同じパターンで、ProGen の標準ナビアイコン（[ALL_NAV_BUTTONS](src/store/settingsStore.ts#L20)）と統一。

### 主要変更ファイル
| 区分 | パス |
| --- | --- |
| 改修 | [src/components/views/HomeLayout.tsx](src/components/views/HomeLayout.tsx) — Tauri D&D + dropZoneRef + scale-125 演出 + 各タイル `icon-anim-{btn.id}` |
| 改修 | [src/styles/globals.css](src/styles/globals.css) — 13 種 keyframe + ホバー rule + reduced-motion ガード |
| 改修 | [src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx) — ホームボタン青線修正 + ProGen 見出し Sparkles 追加 |

---

## v1.0.4: アプリアイコン差し替え (Comic-Bridge ロゴ) (2026-04-25)

### 概要
`logo/comic-bridge_icon.png` (333×333、青グラデの本ロゴ) を全プラットフォーム/全サイズのアプリアイコンに反映。Tauri 公式 CLI (`@tauri-apps/cli` の `icon` サブコマンド) でソース 1 枚から自動生成し、`tauri.conf.json` のパス参照を変更せずに済ませた。

### 1. アイコン全種を再生成
コマンド (プロジェクトルートで実行):
```bash
npx tauri icon "logo/comic-bridge_icon.png"
```

`src-tauri/icons/` 配下を一括上書き:
- Windows / macOS / Linux 用: `32x32.png` / `64x64.png` / `128x128.png` / `128x128@2x.png` (256×256) / `icon.png` (1024×1024) / `icon.ico` / `icon.icns`
- Windows Store 用 (未使用だが生成): `Square{30,44,71,89,107,142,150,284,310}x{...}Logo.png` / `StoreLogo.png`
- iOS / Android 用 (未使用だが生成): `ios/AppIcon-*.png` / `android/mipmap-*/ic_launcher{,_round,_foreground}.png`

[tauri.conf.json](src-tauri/tauri.conf.json) の `bundle.icon` 配列・`bundle.resources.icon.ico → comic-bridge.ico` のパス参照は変更不要。

### 2. TopNav 左端アイコン更新
[TopNav.tsx:164](src/components/layout/TopNav.tsx#L164) は `<img src="/app-icon.png" className="w-6 h-6 rounded">` で表示。生成された `src-tauri/icons/32x32.png` を `public/app-icon.png` にコピーして反映:
```bash
cp "src-tauri/icons/32x32.png" "public/app-icon.png"
```

24×24 表示なので 32×32 ソースが最もシャープ。Tauri CLI が高品質リサンプリング済み。

### 3. ソース画像
`logo/comic-bridge_icon.png` は青グラデの本のシンボルのみ (テキストなし)。アイコンとして小サイズで視認性が確保される。

### 注意事項
- **ソース解像度**: 333×333。Tauri CLI 推奨は 1024×1024 以上だが、生成自体は通る。1024×1024 の `icon.png` や 256×256 の `128x128@2x.png` はアップスケールでやや甘くなる。タスクバー/ショートカット用 (32–128px) は問題なし。
- **CI**: `.github/workflows/release.yml` は `src-tauri/icons/icon.ico` を bundle するため、新 `.ico` が次回タグ push (`v1.0.4`) 時に自動でインストーラーに焼き込まれる。workflow 修正不要。
- **アイコンキャッシュ**: Windows のタスクバー/エクスプローラーがアイコンをキャッシュしているため、新インストーラー実行後もしばらくキャッシュが残る場合がある。`ie4uinit.exe -show` または再起動で解消。

### 主要変更ファイル
| 区分 | パス |
| --- | --- |
| 上書き | `src-tauri/icons/*.png` / `icon.ico` / `icon.icns` (約 50 ファイル) |
| 上書き | [public/app-icon.png](public/app-icon.png) — 32×32 をコピー |
| 新規 | `logo/comic-bridge_icon.png` — アイコンソース原本 |
| バージョン | [package.json](package.json), [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json), [src-tauri/Cargo.toml](src-tauri/Cargo.toml) — 1.0.3 → 1.0.4 |

---

## v1.0.5: テキストエディタ・ビューアー大型刷新 + UI ポリッシュ + 横スライド遷移 + ショートカット拡張 (2026-04-26)

v1.0.4 以降の累積アップデート。テキストエディタ↔ProGen 間のスライドアニメ導入から始まり、ビューアー UI の統合・スクショ機能の動線整理・グローバルショートカット追加・ダークモード対応強化・色味の統一など多領域に渡る整備を 1 リリースに集約。

### 1. テキストエディタ ⇔ ProGen / ホーム ⇔ 詳細 横スライド遷移
[viewStore.ts](src/store/viewStore.ts) に `slidePhase` (`exit-left`/`exit-right`/`enter-from-right`/`enter-from-left`/`exit-up`/`enter-from-bottom` | null) を追加。`runSlideTransition(get, set, direction, switchView)` ヘルパーを抽出して 4 アクションを統一:
- `slideToTextEditor()` / `slideToProgen()` — ProGen ⇔ TextEditor: 右→左 / 左→右モーション
- `slideToHomeDetail()` / `slideFromDetailToHome()` — ホーム ⇔ 詳細: 同パターン
- `slideToTool(switchView)` — TopNav ツールメニュー → 任意ビュー: 下→上モーション (exit-up 200ms → enter-from-bottom 320ms)
- 中断ガード: `setTimeout` 内で `get().slidePhase` 再確認、別ナビ介入時は no-op
- `setActiveView` / `goToHomeWithExit` でも `slidePhase: null` クリアで他ナビと整合

[globals.css](src/styles/globals.css) に対応 keyframes 6 種 + utility class 6 種:
- `slide-out-left/right` / `slide-in-from-left/right` (220/320ms cubic-bezier expo-out)
- `slide-out-up` (200ms ease-in) / `slide-in-from-bottom` (320ms expo-out)

[ViewRouter.tsx](src/components/layout/ViewRouter.tsx) のラッパー className に全フェーズの分岐を追加。

呼び出し側:
- ProgenRuleView「テキストエディタ」ボタン → `slideToTextEditor()`
- UnifiedViewer (textEditorMode) ProGen ボタン (新設) → `slideToProgen()`
- HomeLayout 詳細▶ → `slideToHomeDetail()`
- SpecCheckView「ホーム」ボタン → `slideFromDetailToHome()`
- TopNav ツールメニュー全 3 セクション (一般 / ProGen / 検版) → `slideToTool()` 経由

### 2. UnifiedViewer トップバー大規模統合
- **二段だったツールバー (`bg-bg-secondary` 保存バー + `bg-bg-tertiary/50` タブセレクタ) を 1 本に統合**
  - 旧 Bar B (タブセレクタ + 未保存表示 + プリセット切替) のコンテンツを Bar A の右側 (`flex-1` スペーサー後) に移設
  - 縦領域 28px 節約
- **画像ナビバー全体を撤去**: 旧 `flex-shrink-0 h-6 bg-bg-tertiary/30 ...` センターナビバーを丸ごと削除し、◀ N/M ▶ / − Z% + / 単ページ化 系コントロールをトップバー (別名保存の左) に移設。`detectPaperSize` import / dpi+colorMode 表示も削除
- **ズームボタン並び替え**: `[+] [zoom%] [−]` (拡大が左、縮小が右)
- **下部ステータスバー削除**: `flex-shrink-0 h-5 bg-bg-secondary border-t border-border ... text-text-muted/60 gap-3` をビューアー本体および ProgenImageViewer 両方から撤去
- **保存ドロップダウン化** (PsDesign 互換 `SaveDropdown` 新設): 旧「保存」「別名保存」テキストボタン 2 個を **`Save` アイコン 1 個 + クリック展開ドロップダウン** に統合。メニューには「上書き保存 (Ctrl+S)」「別名で保存 (Ctrl+Shift+S)」の 2 項目、三角ポインター・clickaway / Escape close 対応。トップバーの最左端に配置
- **テキストエディタモード専用ボタン**: ProGen ジャンプボタン (`Sparkles` アイコン)、未保存インジケータも同バー上に共存

### 3. ビューアー キーボードショートカット拡張
- **Ctrl + ←/→**: ページ先頭 / 末尾へジャンプ (`goFirst()` / `goLast()`)。spread モードでは `logicalPage` を 0 / `maxLogicalPage-1` に
- **Ctrl + J**: `showPromptDialog` 経由でページ番号入力 → `parseInt` + 範囲クランプ + 1ベース→0ベース変換 → ジャンプ
- 既存 ←/→ (前/次)、Ctrl+/-/0 (ズーム)、P (Photoshop 起動) は維持
- INPUT/TEXTAREA/SELECT 内では発火しないガードで競合回避

### 4. グローバルショートカット
[AppLayout.tsx](src/components/layout/AppLayout.tsx#L85): Ctrl+A 全選択ハンドラに **Ctrl+O (Cmd+O) フォルダ選択** を追加。Tauri `@tauri-apps/plugin-dialog` の `open({ directory: true })` → `currentFolderPath` 更新 → `psdLoadFolder` で読込 → `triggerRefresh`。INPUT/TEXTAREA/SELECT 内では発火しない。

### 5. 写植仕様タブ刷新 + スクショボタン動線整理
**[SpecLayerGrid.tsx](src/components/spec-checker/SpecLayerGrid.tsx) の構造再編:**
- ファイルカード (旧 `border-accent ring-2 ring-accent/30 bg-accent/5 shadow-md`) を **「枠だけ青く変化」**: `border-accent bg-bg-secondary/50` のみ、リング・塗り・影削除
- ヘッダーから `{N}L` / `{N}T` バッジ削除 (ファイル名のみ表示)
- カード本体に **トグル展開機能** 追加: シェブロンボタンで開閉、初期状態は閉、展開時のみ `border-b border-border/60` のヘッダー区切り表示
- グリッドコンテナに `items-start` 追加 — カード展開時に隣接カードが引き伸ばされる挙動を解消
- グリッド上部に「**すべて展開 / すべて閉じる**」トグルボタン追加 (`expandedIds: Set<string>` を親で集中管理)
- テキストレイヤー行を**ゼブラストライプ化**: 偶数行 `#eaf2fb` (LayerTree と統一)
- 各行レイアウト変更: ○pt をバッジ化 (`text-[9px] px-1 py-px rounded bg-bg-tertiary text-text-muted`) してレイヤー名の **上** に配置、テキストプレビュー (`text-text-muted/50 truncate`) を削除
- 全ファイル合計サマリーの「使用フォント」と「サイズ統計」の間に `border-t border-border/40` の細い区切り線追加

**スクショ → フォント帳 機能の動線整理:**
- 旧スクショボタン (`px-2 py-1.5 border-b border-border/30 space-y-1.5` の使用フォント表示エリア内) を撤去
- ビューアー画像エリア左上にスクショボタンを新設 (リロードボタンと対角配置)
- 有効化条件を `写植仕様タブ open + フォント選択中` の AND に強化、状態に応じてツールチップ・トースト 3 段階切替 (`!specOpen → "写植仕様タブを開いてください" / !activeFontFilter → "フォント選択してください" / 両方OK → 「{font名}」をフォント帳にキャプチャ`)
- テキストエディタモード (`textEditorMode`) ではボタン非表示

### 6. ホーム画面アクションボタン整理
- ワークフロー大ボタンを **ホバー開閉ドロップダウン** に変更 (TopNav ツールメニューと同パターン): `wfHoverRef` + 300ms ディレイ閉、外側 mousedown で `setOpen(false)`、`role="menu"` / `aria-haspopup`
- リスト下端に **下向き三角フキダシ** (`-bottom-[7px] left-1/2 -translate-x-1/2`、border-trick 2 重で枠+塗り、CSS 変数 `--cb-border-color` / `--cb-menu-bg` で light/dark 自動切替)
- リスト本体は outer (三角配置 + 枠) + inner (`overflow-auto rounded-xl`) 2 層構造で三角の clip 回避
- メニュー展開中もシャイン継続: 新 keyframe `cb-button-shine-loop` (3.5s infinite) + `.btn-shine-active` クラスを `wfPickerOpen` で動的付与
- **メニュー出現/消失アニメ**:
  - `dropdown-appear-down/up` (180ms expo-out, transform-origin: top/bottom center): 開く時の縦方向スライドイン
  - `dropdown-disappear-down/up` (160ms ease-in): マウスアウト時の縦方向スライドアウト
  - TopNav ToolMenu / HomeLayout Workflow の両方に適用、`rendered` ローカル state で閉じアニメ中もマウント維持

### 7. ヘッダー データ読み込みボタン整理
[TopNav.tsx](src/components/layout/TopNav.tsx) `SmallBtn`:
- 旧「読み込み済み時に右隣にチェックマーク (クリックでクリア)」分割ボタン形式 → **アイコン + ラベル + ✓ を 1 つの単一ボタン内** で表示する形式に統一
- クリア機能を完全削除 (再読み込みは同じボタンクリックでファイルピッカー再オープン)
- 視覚指標としての `Check` アイコンは `aria-hidden` で残す

### 8. PsDesign 風保存ドロップダウン (再掲、UnifiedViewer 専用)
クリック開閉、外側 mousedown / Escape close、三角ポインター、メニュー項目に Save / FilePlus アイコン、Ctrl+S / Ctrl+Shift+S ショートカット表示。

### 9. ホーム詳細ビュー (SpecCheckView) 構造整理
- カラーモードボタン (TIFF) を **2 列グリッド化**: `flex` → `grid grid-cols-2 gap-0.5`、各ボタンを `flex-1` → `w-full` に
- TIFF File List パネルを **折りたたみ可能化** (デフォルト閉): `w-8 ↔ w-[210px]` の transition、≪≫ シェブロンで開閉
- ホームタイル切替時の `goToTile` の縦スライドはローカル state で維持

### 10. 各種ダイアログ ↔ outside click close
- [GuideEditorModal](src/components/guide-editor/GuideEditorModal.tsx): 背景 onClick で `e.target === e.currentTarget` 判定 → `closeEditor()`、内側 dialog に `e.stopPropagation()`
- [SpecScanJsonDialog](src/components/spec-checker/SpecScanJsonDialog.tsx): 同パターン
- [TextExtractButton](src/components/common/TextExtractButton.tsx): containerRef + `useEffect(() => { document.addEventListener("mousedown", ...) })` で外側 mousedown 検知してポップオーバー閉

### 11. ガイドエディタ青基調化 + ルーラー色統一
- **GuideCanvas ルーラーコーナー** (`bg-bg-tertiary border-border-light` → ハードコード `#ecf2fa` + 縁 `#bcd0ee`)
- **CanvasRuler の塗り色を全て青基調に書き換え**: 背景 (`#f8f6f3` → `#ecf2fa`) / 画像範囲背景 (`#f0eeeb` → `#d8e5f4`) / 主目盛り (`#4a4a58` → `#1e3a5f`) / 中目盛り (`#8a8a98` → `#6a8aae`) / 補助目盛り (`#a8a8b4` → `#9cb0cb`) / エッジ (`#ddd8d3` → `#bcd0ee`)
- **TiffCropEditor のルーラーコーナー** (`bg-[#f8f6f3] border-[#ddd8d3]` → 同 `#ecf2fa` / `#bcd0ee`) で完全一致
- **`.btn-primary`** を `linear-gradient(#3a7bd5, #0078d4)` ハードコード → **CSS 変数連動** (`rgb(var(--cb-accent-rgb))` / `rgb(var(--cb-accent-hover-rgb))`) に書換 → 設定パネルアクセント変更が GuideEditor の「適用する」ボタンにも追従
- 「既存ガイドあり → 置き換えられます」通知 (`bg-warning/10 border-warning/20 text-warning`) → **`bg-accent/10 border-accent/20 text-accent`** に変更

### 12. レイヤー差替え/合成 配色のクリーンアップ
- ComposePanel の warning 残り (input focus / divider 5 箇所) を `accent` / `border-border-light` に置換
- 合成ヘッダーアイコン: `text-warning` → `text-text-muted` (グレー)
- 合成「+ カスタム要素を追加」: `text-warning hover:text-warning/80` → `text-accent hover:text-accent-hover` (青文字)
- ReplacePanel の **スイッチ差替え / 合成 ModeCard** を `color="warning"` → `color="accent-warm"` (Steel Blue)
- スイッチ・合成セクションの左縦区切り線 `border-warning/30` → `border-accent-warm/30` で ModeCard と統一
- ReplacePanel 合成モード内の「+ カスタム要素を追加」ボタンも `text-accent` 化

### 13. リネーム UI 整理
[LayerRenamePanel.tsx](src/components/rename/LayerRenamePanel.tsx) のリネームルール:
- ヘッダー右側の [+ レイヤー][+ グループ] ボタンを撤去
- 空状態時: メッセージ「ルールを追加して...」の **下** に `flex gap-1` でボタン配置
- ルールあり時: ルールリストの **末尾** にも同ボタンを配置 (`flex gap-1 pt-1`)

### 14. テキスト抽出ボタン ダークモード対応
- ポップオーバー: `bg-white` → `bg-bg-secondary` (CSS 変数連動)
- ボタン色: ハードコード `[#3a7bd5]` 系 4 箇所 → `accent` 変数ベース
- スピナー: `border-[#3a7bd5]/30 border-t-[#3a7bd5]` → `border-accent/30 border-t-accent`
- **`variant` prop 追加** (`"accent"` | `"neutral"`、デフォルト `"accent"`):
  - 原因: HomeLayout のラッパー `[&>div>button]:!text-text-secondary` (descendant セレクタ経由) はダークモード上書き `html.dark-mode-invert .text-text-secondary` (クラス直接マッチのみ) に発火しない
  - 対策: `variant="neutral"` でボタン本体に `text-text-secondary` クラスを直接適用
  - HomeLayout 4 列アクションボタン行で `variant="neutral"` 指定 → ダーク時に `#aaaaaa` で他 ActionButton と一貫

### 15. 依頼準備 / フォルダセットアップ 配色統一
- [RequestPrepView.tsx](src/components/views/RequestPrepView.tsx) のチェック未完了ボックス 3 箇所 (`bg-warning/5 border-warning/20`) → `bg-accent/5 border-accent/20`
- 「不足:」メッセージ (`text-warning`) → `text-error` (赤)
- [FolderSetupView.tsx](src/components/views/FolderSetupView.tsx) の作品情報JSON セクション (badge / mode 切替ボタン / 既存JSON選択ボタン) の `purple-500` 系 3 箇所 → `accent` 系に統一

### 16. その他細部修正
- 見開き分割 ([SplitPreview.tsx](src/components/split/SplitPreview.tsx)) ヘッダーから画像サイズ表示削除、uneven モードボタンを `ml-auto` で右寄せ維持
- ホーム詳細ヘッダーから PDF 表示モード切替ボタン (旧 `text-error bg-error/10` 系) を一旦削除し、user 要望で復元
- ProGen ルール編集 → テキストエディタジャンプボタンを左端に移設 (上部バー整理)
- UnifiedViewer 写植仕様タブ「使用フォント (M種/N ファイル)」エリアから旧スクショボタン削除

### 主要変更ファイル
| 区分 | パス |
| --- | --- |
| 改修 | [src/store/viewStore.ts](src/store/viewStore.ts) — slidePhase 機構 + 5 slide action + runSlideTransition helper |
| 改修 | [src/styles/globals.css](src/styles/globals.css) — 14 種 keyframes (slide / dropdown / shine-loop) |
| 改修 | [src/components/layout/AppLayout.tsx](src/components/layout/AppLayout.tsx) — Ctrl+O フォルダ選択 |
| 改修 | [src/components/layout/ViewRouter.tsx](src/components/layout/ViewRouter.tsx) — slidePhase className 分岐 |
| 改修 | [src/components/layout/TopNav.tsx](src/components/layout/TopNav.tsx) — SmallBtn 単一ボタン化 / ToolMenu slideToTool / dropdown anim |
| 改修 | [src/components/unified-viewer/UnifiedViewer.tsx](src/components/unified-viewer/UnifiedViewer.tsx) — トップバー統合 / ナビバー撤去 / SaveDropdown / Ctrl+J/←→ |
| 改修 | [src/components/unified-viewer/ProgenImageViewer.tsx](src/components/unified-viewer/ProgenImageViewer.tsx) — ステータスバー削除 |
| 改修 | [src/components/spec-checker/SpecLayerGrid.tsx](src/components/spec-checker/SpecLayerGrid.tsx) — トグル展開 / 全展開ボタン / ゼブラ / バッジ化 |
| 改修 | [src/components/views/HomeLayout.tsx](src/components/views/HomeLayout.tsx) — ワークフロードロップダウン (ホバー / 三角 / シャイン継続) |
| 改修 | [src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx) — slideFromDetailToHome 切替 |
| 改修 | [src/components/views/TiffView.tsx](src/components/views/TiffView.tsx) — TiffFileList の固定幅撤去 |
| 改修 | [src/components/tiff/TiffFileList.tsx](src/components/tiff/TiffFileList.tsx) — 折りたたみ機能 |
| 改修 | [src/components/tiff/TiffSettingsPanel.tsx](src/components/tiff/TiffSettingsPanel.tsx) — カラーモード 2 列グリッド |
| 改修 | [src/components/tiff/TiffCropEditor.tsx](src/components/tiff/TiffCropEditor.tsx) — ルーラーコーナー青基調 |
| 改修 | [src/components/guide-editor/CanvasRuler.tsx](src/components/guide-editor/CanvasRuler.tsx) — 全描画色青基調化 |
| 改修 | [src/components/guide-editor/GuideCanvas.tsx](src/components/guide-editor/GuideCanvas.tsx) — ルーラーコーナー青基調 |
| 改修 | [src/components/guide-editor/GuideEditorModal.tsx](src/components/guide-editor/GuideEditorModal.tsx) — 背景クリックで閉、通知青化 |
| 改修 | [src/components/spec-checker/SpecScanJsonDialog.tsx](src/components/spec-checker/SpecScanJsonDialog.tsx) — 背景クリックで閉 |
| 改修 | [src/components/common/TextExtractButton.tsx](src/components/common/TextExtractButton.tsx) — variant prop / ダークモード対応 / 外側クリック close |
| 改修 | [src/components/compose/ComposePanel.tsx](src/components/compose/ComposePanel.tsx) — warning カラー一掃 |
| 改修 | [src/components/replace/ReplacePanel.tsx](src/components/replace/ReplacePanel.tsx) — ModeCard accent-warm 化 / 区切り線青化 / カスタム追加青化 |
| 改修 | [src/components/rename/LayerRenamePanel.tsx](src/components/rename/LayerRenamePanel.tsx) — ボタン位置変更 |
| 改修 | [src/components/views/RequestPrepView.tsx](src/components/views/RequestPrepView.tsx) — accent/error 系へ移行 |
| 改修 | [src/components/views/FolderSetupView.tsx](src/components/views/FolderSetupView.tsx) — purple-500 を accent 化 |
| 改修 | [src/components/split/SplitPreview.tsx](src/components/split/SplitPreview.tsx) — サイズ表示削除 |
| 改修 | [src/components/progen/ProgenRuleView.tsx](src/components/progen/ProgenRuleView.tsx) — テキストエディタジャンプ slide 化 |
| バージョン | [package.json](package.json), [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json), [src-tauri/Cargo.toml](src-tauri/Cargo.toml) — 1.0.4 → 1.0.5 |

---

## v1.0.6: ホームタイル色分けアイコン + TXT/JSON カード化 + 写植仕様バッジ整理 (2026-04-27)

### 1. ホームタイルアイコンの「四角背景 + 白い線画」化
[HomeLayout.tsx](src/components/views/HomeLayout.tsx) のツールタイルグリッドのアイコン表示を刷新。アイコンを `w-12 h-12 rounded-xl border` の角丸四角ラッパーで囲み、本体は lucide-react の線画 SVG を `text-white strokeWidth={2}` で描画。

**カテゴリ別の背景色マップ** (`TILE_ICON_COLORS` 定数、ファイル冒頭 [HomeLayout.tsx:37-86](src/components/views/HomeLayout.tsx#L37)):

| カテゴリ | btn.id | 背景色 |
| --- | --- | --- |
| 緑 (`bg-green-500`) | `progen` / `textEditor` / `split` / `layerControl` | 入稿系 |
| 紫 (`bg-purple-500`) | `inspection` / `unifiedViewer` / `layers` / `scanPsd` | 確認・解析系 |
| オレンジ (`bg-orange-500`) | `replace` / `compose` / `tiff` | 加工系 |
| 水色 (`bg-sky-400`) | `folderSetup` / `requestPrep` | 準備系 |
| デフォルト (`bg-accent`) | 上記以外 | フォールバック |

各色は `bg` / `border` / `hover` 3種を `TileIconColor` 型でまとめ、`group-hover:bg-{color}-600` で hover 時に一段濃く。`icon-anim-${btn.id}` の個別アニメーションは維持。

### 2. TXT / JSON ファイルもサムネイルビューでカード表示
従来は `folderContents.allFiles` のうち PSD 系以外（txt/json）はホーム詳細のサムネイル画面で **小さな横並びピル** で表示されていたものを、PSD ファイルと同じカードグリッドに整列するように変更。

**新規:** [src/components/preview/TextFileCard.tsx](src/components/preview/TextFileCard.tsx)
- ThumbnailCard と同じアスペクト比 (1 : 1.4142 = A4) / 同じ ring / shadow / hover-translate スタイル
- 中央に拡張子別カラーの SVG ロゴ (TXT=スレート / JSON=アンバー) — `lucide-react` の `FileText` / `FileJson`
- 左上に拡張子バッジ (`TXT` / `JSON`)、下部にファイル名グラデオーバーレイ
- `isSelected` 時は ThumbnailCard と同じ水色 ring + box-shadow

**改修:** [src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx)
- 旧ピル表示 (`flex flex-wrap` の 5px ピル) を `grid auto-fill, minmax(${size}px, ${size*1.3}px)` のカードグリッドに置換
- `THUMBNAIL_SIZES[thumbnailSize].value` を使ってサムネイルサイズ設定（小/中/大）に追従
- クリック・右クリックメニュー・選択ハイライト (`selectedNonPsdItem`) は従来どおり

リスト表示 (`viewMode === "list"` 時、`PsdFileListView`) は既存のコンパクト行表示のまま維持。`getFileIconColor` / `getFileExt` は List 表示で引き続き使用。

### 3. 統合ビューアー写植仕様タブのバッジ整理
[UnifiedViewer.tsx:1275-1308](src/components/unified-viewer/UnifiedViewer.tsx#L1275) のテキストレイヤー行レイアウト:

**削除**: テキストプレビュー行 `<div className="text-[10px] text-text-muted/60 truncate mt-0.5">` (テキスト本文を `\n → " "` 変換 + 30 文字抜粋表示) — レイアウト圧迫の原因だったため撤去

**変更**: フォントサイズ表示 `<span className="text-[10px] text-text-muted">` (旧: プレーンテキスト `12/14pt`) → 白フチ・カーニングと統一感のあるバッジスタイル `text-[9px] px-1 py-px rounded bg-bg-tertiary text-text-secondary` に変更

**統合**: サイズ・白フチ・カーニングを 1 つの `flex flex-wrap gap-1` バッジ行にまとめる IIFE で集約（旧: サイズだけ別の `<span>`、白フチ/カーニングが別の IIFE で 2 段に分かれていた）

### 主要変更ファイル
| 区分 | パス |
| --- | --- |
| 新規 | [src/components/preview/TextFileCard.tsx](src/components/preview/TextFileCard.tsx) — TXT/JSON 用カードコンポーネント |
| 改修 | [src/components/views/HomeLayout.tsx](src/components/views/HomeLayout.tsx) — `TILE_ICON_COLORS` 色マップ、アイコン背景四角化、白線画化 |
| 改修 | [src/components/views/SpecCheckView.tsx](src/components/views/SpecCheckView.tsx) — TXT/JSON ピル → カードグリッド、TextFileCard import |
| 改修 | [src/components/unified-viewer/UnifiedViewer.tsx](src/components/unified-viewer/UnifiedViewer.tsx) — 写植仕様タブのテキスト本文プレビュー削除、サイズをバッジ化 |
| バージョン | [package.json](package.json), [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json), [src-tauri/Cargo.toml](src-tauri/Cargo.toml) — 1.0.5 → 1.0.6 |
