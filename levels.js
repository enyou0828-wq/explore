'use strict';
// 每個興趣分枝的學習順序：四層，由內到外 入門 → 基礎 → 進階 → 深入。
// 同一分枝裡，上一層至少完成一個主題，下一層才會解鎖（見 app.js 的 unlocked）。
// 排法：先放花時間少、不需要前備知識的，再放需要前一層概念或更多投入的。
const LEVEL_NAMES = ['入門', '基礎', '進階', '深入'];
const LEVELS = {
  sci: [['sleep', 'memory', 'weather'], ['microbiome', 'compound', 'botanic'], ['museum', 'evolution', 'soundsci'], ['blackhole', 'llm', 'stargaze']],
  tech: [['budget', 'video', 'platform'], ['lightroom', 'beatmaking', 'llm'], ['python', 'machinetranslation', 'chess'], ['website', 'arduino', 'blackhole']],
  biz: [['budget', 'coffeechain', 'marketing'], ['compound', 'behavecon', 'mealprep'], ['inflation', 'index', 'platform'], ['gametheory', 'python', 'marketstall']],
  psych: [['sleep', 'habit', 'meditation'], ['memory', 'behavecon', 'stoic'], ['bookclub', 'linguistics', 'chess'], ['gametheory', 'volunteer', 'detox']],
  phil: [['letter', 'album', 'wabisabi'], ['stoic', 'meditation', 'writing'], ['poetry', 'hero', 'usedbooks'], ['bookclub', 'origbook', 'solotrip']],
  lang: [['lyrics', 'etymology', 'chinesechar'], ['memory', 'japanese', 'foreignmenu'], ['english', 'calligraphy', 'linguistics'], ['poetry', 'machinetranslation', 'origbook']],
  hist: [['market', 'neighborhood', 'rock'], ['hiphop', 'chinesechar', 'museum'], ['impressionism', 'bauhaus', 'etymology'], ['hero', 'usedbooks', 'silkroad']],
  art: [['color', 'photowalk', 'movie', 'concert'], ['sketch', 'museum', 'impressionism', 'wabisabi'], ['bauhaus', 'watercolor', 'pottery', 'filmlang'], ['film', 'japanese', 'silkroad']],
  photo: [['photowalk', 'sunset', 'neighborhood'], ['color', 'nightmarket', 'baseball'], ['sunrise', 'lightroom', 'video'], ['film', 'stargaze', 'solotrip']],
  media: [['movie', 'soundtrack', 'photowalk'], ['hero', 'marketing', 'writing'], ['filmlang', 'video', 'english'], ['film', 'website', 'openmic']],
  music: [['album', 'rock', 'hiphop'], ['concert', 'soundtrack', 'lyrics'], ['soundsci', 'beatmaking', 'dance'], ['guitar', 'piano', 'openmic']],
  craft: [['plants', 'letter', 'coffee'], ['sketch', 'cooking', 'pottery'], ['cookingclass', 'watercolor', 'bread'], ['calligraphy', 'arduino', 'marketstall']],
  food: [['market', 'coffeechain', 'teatasting'], ['nightmarket', 'cooking', 'coffee'], ['microbiome', 'foreignmenu', 'cookingclass'], ['mealprep', 'bread', 'sportmeal']],
  health: [['sleep', 'habit', 'meditation'], ['memory', 'microbiome', 'running'], ['swim', 'hiking', 'basketball'], ['strength', 'bouldering', 'detox']],
  sport: [['baseball', 'badminton', 'running'], ['cycling', 'dance', 'basketball'], ['swim', 'hiking', 'roadrace'], ['strength', 'bouldering', 'sportmeal']],
  nature: [['sunset', 'plants', 'neighborhood', 'weather'], ['photowalk', 'botanic', 'sunrise', 'running'], ['hiking', 'cycling', 'evolution', 'volunteer'], ['stargaze', 'solotrip', 'detox', 'camping']],
};
