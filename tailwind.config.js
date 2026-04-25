/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ══════════════════════════════════════════════════════════
        // 背景: 台割マネージャー準拠（ホワイトベース・クール中性）
        // ══════════════════════════════════════════════════════════
        bg: {
          primary:   "#f8f9fc",  // クールホワイト（メイン背景）
          secondary: "#ffffff",  // 純白（パネル・モーダル）
          tertiary:  "#f0f2f5",  // クール薄グレー（カード・非アクティブ）
          elevated:  "#ffffff",  // 浮き上がり要素
        },
        // ══════════════════════════════════════════════════════════
        // テキスト: 深いネイビー系、全てAA以上
        // ══════════════════════════════════════════════════════════
        text: {
          primary:   "#1a1a2e",  // 主要（台割マネージャー準拠）
          secondary: "#4a4a5a",  // 副次 (9.6:1 AAA)
          muted:     "#6b6b7a",  // 控えめ (5.5:1 AA)
        },
        // ══════════════════════════════════════════════════════════
        // アクセント: 単一ブルー原則（台割マネージャー準拠）
        // ══════════════════════════════════════════════════════════
        accent: {
          // CSS 変数経由（settingsStore.accentColor から AppLayout が更新）。
          // RGB triplet（"58 123 213" 形式）+ <alpha-value> で bg-accent/15 等の
          // opacity モディファイアを機能させる。派生色は colorUtils.deriveAccentPalette() で HSL 派生。
          DEFAULT:   "rgb(var(--cb-accent-rgb) / <alpha-value>)",
          hover:     "rgb(var(--cb-accent-hover-rgb) / <alpha-value>)",
          secondary: "rgb(var(--cb-accent-secondary-rgb) / <alpha-value>)",
          tertiary:  "rgb(var(--cb-accent-tertiary-rgb) / <alpha-value>)",
          warm:      "rgb(var(--cb-accent-warm-rgb) / <alpha-value>)",
          glow:      "var(--cb-accent-glow)",
        },
        // ══════════════════════════════════════════════════════════
        // 漫画装飾カラー: 事実上廃止（CSS で全て bg-tertiary に上書き）
        // 後方互換のため定義のみ残す
        // ══════════════════════════════════════════════════════════
        manga: {
          pink:     "#f5ecec",
          mint:     "#eaf0eb",
          lavender: "#ecebf0",
          peach:    "#f2ede4",
          sky:      "#e8ecf0",
          yellow:   "#f3f0e4",
        },
        // ══════════════════════════════════════════════════════════
        // ステータス: 印刷インク調、全てAA
        // ══════════════════════════════════════════════════════════
        success: "#15803d",  // 緑 (5.5:1)
        warning: "#a16207",  // オレンジブラウン (5.9:1)
        error:   "#b91c1c",  // 赤 (6.4:1)
        // ══════════════════════════════════════════════════════════
        // ガイド線
        // ══════════════════════════════════════════════════════════
        guide: {
          h: "#dc2626",
          v: "#0891b2",
        },
        // ══════════════════════════════════════════════════════════
        // フォルダアイコン: Windows風マニラフォルダ（オレンジよりの黄色）
        // ══════════════════════════════════════════════════════════
        folder: {
          DEFAULT: "#f5b73d",  // マニラフォルダ基調
          hover:   "#ffc857",  // ホバー時やや明るく
          dark:    "#d49a2b",  // 縁・影表現
        },
        // ══════════════════════════════════════════════════════════
        // ボーダー: クール中性（台割マネージャー準拠）
        // ══════════════════════════════════════════════════════════
        border: {
          DEFAULT: "#d5d9e0",  // 明確な区切り
          light:   "#e5e7ec",  // 薄い区切り
        },
      },
      // ══════════════════════════════════════════════════════════════
      // フォント: Inter + Noto Sans JP + IBM Plex Sans JP + JetBrains
      // ══════════════════════════════════════════════════════════════
      fontFamily: {
        sans: [
          '"Inter"',
          '"Noto Sans JP"',
          '"Yu Gothic UI"',
          '"Meiryo"',
          "sans-serif",
        ],
        display: [
          '"IBM Plex Sans JP"',
          '"Noto Sans JP"',
          '"Yu Gothic UI"',
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"IBM Plex Mono"',
          "Consolas",
          "Menlo",
          "monospace",
        ],
      },
      // ══════════════════════════════════════════════════════════════
      // Type Scale: 最小12px保証、1st提案ベース
      // ══════════════════════════════════════════════════════════════
      fontSize: {
        'xs':   ['12px', { lineHeight: '1.55', letterSpacing: '0.005em'  }],
        'sm':   ['13px', { lineHeight: '1.6',  letterSpacing: '0.003em'  }],
        'base': ['14px', { lineHeight: '1.65'                            }],
        'md':   ['15px', { lineHeight: '1.6'                             }],
        'lg':   ['17px', { lineHeight: '1.55', letterSpacing: '-0.005em' }],
        'xl':   ['19px', { lineHeight: '1.5',  letterSpacing: '-0.01em'  }],
        '2xl':  ['22px', { lineHeight: '1.45', letterSpacing: '-0.015em' }],
        '3xl':  ['28px', { lineHeight: '1.35', letterSpacing: '-0.02em'  }],
        '4xl':  ['34px', { lineHeight: '1.3',  letterSpacing: '-0.025em' }],
      },
      fontWeight: {
        normal:   '400',
        medium:   '500',
        semibold: '600',
        bold:     '700',
      },
      // ══════════════════════════════════════════════════════════════
      // 角丸: 中間値（手触りのソフトさ維持）
      // ══════════════════════════════════════════════════════════════
      borderRadius: {
        'none':    '0px',
        'sm':      '2px',
        'DEFAULT': '4px',
        'md':      '6px',
        'lg':      '8px',
        'xl':      '12px',  // 16→12
        '2xl':     '16px',  // 24→16
        '3xl':     '20px',  // 32→20
        'full':    '9999px',
      },
      // ══════════════════════════════════════════════════════════════
      // 影: ドロップシャドウ維持 + 3色グロー（Indigo系に統一）
      // ══════════════════════════════════════════════════════════════
      boxShadow: {
        'soft':     '0 2px 8px rgba(26, 26, 46, 0.06), 0 1px 2px rgba(26, 26, 46, 0.04)',
        'card':     '0 4px 16px rgba(26, 26, 46, 0.06), 0 2px 4px rgba(26, 26, 46, 0.04)',
        'elevated': '0 8px 24px rgba(26, 26, 46, 0.10), 0 4px 8px rgba(26, 26, 46, 0.06)',
        // 3色グロー（ブルー主体、既存クラス名を後方互換で維持）
        'glow-pink':    '0 0 20px rgba(58, 123, 213, 0.22)',  // Blue
        'glow-purple':  '0 0 20px rgba(0, 120, 212, 0.22)',   // Deep Blue
        'glow-mint':    '0 0 20px rgba(14, 116, 144, 0.22)',  // Teal
        'glow-success': '0 0 16px rgba(21, 128, 61, 0.25)',
        'glow-error':   '0 0 16px rgba(185, 28, 28, 0.25)',
      },
      // ══════════════════════════════════════════════════════════════
      // アニメーション
      // ══════════════════════════════════════════════════════════════
      animation: {
        'bounce-soft': 'bounce-soft 0.3s ease-out',
        'pop':         'pop 0.15s ease-out',
        'glow-pulse':  'glow-pulse 2s ease-in-out infinite',
        'float':       'float 3s ease-in-out infinite',
        'slide-up':    'slide-up 0.25s ease-out',
        'confetti':    'confetti 1s ease-out forwards',
      },
      keyframes: {
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-4px)' },
        },
        'pop': {
          '0%':   { transform: 'scale(1)' },
          '50%':  { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0   rgba(58, 123, 213, 0.25)' },
          '50%':      { boxShadow: '0 0 0 6px rgba(58, 123, 213, 0)'    },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-4px)' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
        'confetti': {
          '0%':   { transform: 'translateY(0) rotate(0deg)',      opacity: '1' },
          '100%': { transform: 'translateY(-80px) rotate(480deg)', opacity: '0' },
        },
      },
      backgroundImage: {
        'gradient-pop':   'linear-gradient(135deg, #3a7bd5, #0078d4)',
        'gradient-fresh': 'linear-gradient(135deg, #1e90ff, #3a7bd5)',
        'gradient-warm':  'linear-gradient(135deg, #1e6bb8, #0078d4)',
        'gradient-card':  'linear-gradient(180deg, #ffffff, #f8f9fc)',
      },
    },
  },
  plugins: [],
};
