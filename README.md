# Mini Arcade — Telegram Mini App

Мини-приложение для Telegram с главным меню и разделами «Играть», «Друзья», «Магазин», «Новости». Сделано как статический сайт без сборки: чистые HTML, CSS и JavaScript, официальный Telegram WebApp SDK лежит локально.

## Структура

```
index.html              разметка экранов и главное меню
styles.css              оформление, адаптив, safe-area, анимации
app.js                  навигация, Telegram WebApp API, haptics, профиль
telegram-web-app.js     официальный Telegram WebApp SDK (вендор)
.nojekyll               отключает Jekyll на GitHub Pages
```

## Локальный запуск

```bash
python3 -m http.server 8080
```

Открыть `http://localhost:8080`. Вне Telegram приложение работает в браузере в режиме гостя.

## Деплой на GitHub Pages

1. Создать публичный репозиторий и запушить ветку `main`.
2. В репозитории: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, ветка `main`, папка `/ (root)`.
3. Сайт будет доступен по адресу `https://<user>.github.io/<repo>/`.

Для автоматической настройки через API токену нужны права:

- **Contents: Read and write** — чтобы пушить код;
- **Administration: Read and write** — чтобы создавать репозиторий;
- **Pages: Read and write** — чтобы включить GitHub Pages.

## Подключение к Telegram

Бот: [@ligigark_bot](https://t.me/ligigark_bot), приложение: `https://tea-profesor.github.io/test/`.

1. У [@BotFather](https://t.me/BotFather) выполнить `/setmenubutton`, выбрать `@ligigark_bot`.
2. Указать URL `https://tea-profesor.github.io/test/` и текст кнопки `Играть`.
3. Открыть бота и нажать кнопку меню — Mini App запустится внутри Telegram.

Для продакшена рекомендуется собственный домен: Telegram требует HTTPS, GitHub Pages его даёт по умолчанию.

## Что уже работает

- Вертикальное меню в левом верхнем углу: Играть → Друзья → Магазин → Новости → Чат.
- Переходы между экранами с анимацией, кнопка «Назад» и системная кнопка Telegram.
- Данные пользователя из `initDataUnsafe`: имя, username, аватар.
- Тактильный отклик, безопасные отступы, тёмная неоновая тема.
- Раздел «Друзья» с приглашением через `t.me/share/url`.
- Экран «Чат» с переходом в группу сообщества (ссылка задаётся в `CHAT_URL`).

## Дальше

- Игровой режим (механика будет описана отдельно).
- Подключение общего чата.
- Общая валюта и покупки в магазине.
- Список друзей и рекорды.
- Синхронизация прогресса через `CloudStorage`.
