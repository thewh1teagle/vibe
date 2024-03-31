## 2024-31-03

-   Remove deprecated app-plugin dependency and used `@tauri-apps/api/app` instead
-   Fix macOS build + action
    -   remove static linking
    -   embed frameworks in bundle
    -   Update action env variables for signing (breaking changes in tauri)

## 2024-30-03

-   Update to tauri v2
    -   Remove deprecated window-shadow plugin of tauri
    -   Fix client side APIs of tauri due to changes
    -   Add capabillities in src-tauri
    -   Change `tauri.conf.json` using migrate tool
-   Improve errors sent to frontend
-   Change prettierrc.json to indent with 4 space
-   (Temporarily?) remove static link from macos which depends on HomeBrew
