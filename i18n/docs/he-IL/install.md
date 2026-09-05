<!-- source: 664188849caa -->

# הערות התקנה 📝

## דרישות מערכת

Windows: גרסה `8` ומעלה.

macOS: גרסה `13.3` ומעלה.

Linux: נבדק על `ubuntu-22.04+`

חומרה:
אין דרישה מיוחדת. ניתן להתאים את השימוש במשאבים דרך ההגדרות המתקדמות בחלון הראשי.

כרגע, האזנה לקובץ אודיו אינה נתמכת ב-`Linux`

בנוסף, ייתכן שתצטרכו להגדיר את משתנה הסביבה הזה לפני ההפעלה

```console
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

## הגדרת סיכום עם Ollama

1. התקנת Ollama

הורידו והתקינו את Ollama מהכתובת https://ollama.com.

2. התקנת מודל

לאחר ההתקנה, הגדירו מודל לצורך סיכום. לדוגמה, אפשר להתקין את `llama3.1` על ידי הרצת הפקודה הבאה בטרמינל:

```console
ollama run llama3.1
```

3. הפעלת הסיכום

לאחר התקנת המודל, פתחו את אפליקציית Ollama. נווטו אל אפשרויות נוספות והפעילו את הסיכום ממש לפני שלב התמלול. אפשר להשאיר את שאר ההגדרות בערכי ברירת המחדל שלהן.

_ודאו שהרצתם את 'Run check` כדי לבדוק שזה עובד_

זהו! הסיכום דרך Ollama פעיל כעת.

## חותמות זמן יציבות (כתוביות / סרטים)

Vibe כולל מצב חותמות זמן יציב לתזמון כתוביות מדויק יותר בתוכן ארוך.

1. פתחו את `More Options`.
2. הפעילו את `Stable timestamps`.
3. אם תתבקשו, הורידו את מודל ה-VAD.

הערות:

- מצב זה שם דגש על איכות, ובדרך כלל איטי פי `4x` בהשוואה לתמלול רגיל.
- מתאים במיוחד ליצירת כתוביות ולתזמון תמלול של סרטים וסרטונים.
- מודל ה-VAD המשמש כברירת מחדל: `ggml-silero-v6.2.0.bin`
- מקור המודל המקורי: `https://huggingface.co/ggml-org/whisper-vad`

## תרגום לאנגלית

תרגום לאנגלית עובד רק עם מודלי Whisper `small`,‏ `medium` ו-`large`. הוא אינו עובד עם `large-v3-turbo` של Whisper.

אם אתם זקוקים לתרגום, הורידו מודל נתמך מ[דף המודלים](/vibe/docs#models).

## התקנה ידנית 🛠️

`MacOS Apple silicon`: התקינו את קובץ ה-`aarch64.dmg` מ[הגרסאות](https://github.com/thewh1teagle/vibe/releases) **אל תשכחו ללחוץ לחיצה ימנית ולפתוח מ-Applications בפעם הראשונה**

`MacOS Intel`: התקינו את קובץ ה-`x64.dmg` מ[הגרסאות](https://github.com/thewh1teagle/vibe/releases) **אל תשכחו ללחוץ לחיצה ימנית ולפתוח מ-Applications בפעם הראשונה**

`Windows`: התקינו את קובץ ה-`.exe` מ[הגרסאות](https://github.com/thewh1teagle/vibe/releases)

`Linux`: התקינו את קובץ ה-`.deb` מ[הגרסאות](https://github.com/thewh1teagle/vibe/releases) (משתמשי `Arch` יכולים להשתמש ב-[debtap](https://aur.archlinux.org/packages/debtap))

_כל המודלים זמינים להתקנה ידנית. ראו [מודלים בנויים מראש](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## התקנה במצב לא מקוון 💾

התקנה במצב לא מקוון עם Vibe היא פשוטה: פתחו את האפליקציה, בטלו את ההורדה, ונווטו אל אזור ה-`Customize` בתוך ההגדרות.

_כל המודלים זמינים להתקנה ידנית. ראו את ההגדרות או [מודלים בנויים מראש](https://github.com/thewh1teagle/vibe/releases/tag/v0.0.1)_

## תמלול מהיר יותר ב-macOS (פי 2-3) 🌟

1. הורידו את קובץ ה-`.mlcmodelc.zip` המתאים למודל שלכם מהכתובת https://huggingface.co/ggerganov/whisper.cpp/tree/main

- לדוגמה, `ggml-medium-encoder.mlmodelc.zip` תואם ל-`ggml-medium-encoder.bin`

2. פתחו את נתיב המודלים דרך הגדרות Vibe
3. גררו ושחררו את קובץ ה-`.mlcmodel.c` לתוך תיקיית המודלים כך שיהיה לצד קובץ ה-`.bin`
4. תמללו קובץ; בפעם הראשונה שבה תשתמשו במודל זה ייקח יותר זמן כי הוא מהדר את המודל. בכל פעם שאחריה זה יהיה מהיר יותר.

## שגיאת `msvc140.dll` לא נמצא ❌

הורידו והתקינו את [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## קישור מיוחד להורדת מודלים ב-vibe

תוכלו להוסיף לאתרים שלכם קישורים שיאפשרו למשתמשים להוריד את המודלים שלכם בקלות ישירות מהאתר שלכם אל vibe.

הכתובת (URL) צריכה להיראות כך

```
vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true
```

## שימוש בשרת linux

כדי להשתמש ב-Vibe בשרת linux עליכם להתקין תצוגה מדומה

```console
sudo apt-get install xvfb -y
Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=1

wget https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium.bin
wget https://github.com/thewh1teagle/vibe/raw/main/server/fixtures/single.wav
vibe --model ggml-medium.bin --file single.wav
```
