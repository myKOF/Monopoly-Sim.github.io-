---
description: 執行通知動作 (JavaScript)
---

當需要通知使用者時，根據情況選擇以下其中一個版本在瀏覽器 Console 執行：

### 1. 簡短通知 (持續 5 秒後關閉)
適用於：一般作業完成或需要中途確認。

```javascript
(function() {
    const originalTitle = document.title;
    let count = 0;
    const interval = setInterval(() => {
        document.title = (document.title === originalTitle) ? "【待確認】" : originalTitle;
        count++;
        if (count >= 10) { // 0.5s * 10 = 5s
            clearInterval(interval);
            document.title = originalTitle;
            window.close();
        }
    }, 500);
})();
```

### 2. 永久通知 (彈窗 + 持續閃爍)
適用於：完成作業等待驗收。

```javascript
(function() {
    const originalTitle = document.title;
    setInterval(() => {
        document.title = (document.title === originalTitle) ? "【待確認】" : originalTitle;
    }, 500);
    alert("作業已完成，請驗收！");
})();
```
