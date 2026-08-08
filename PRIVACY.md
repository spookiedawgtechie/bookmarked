# Bookmarked Privacy Notice

Effective: 8 August 2026

Bookmarked is a local-first, open-source book tracker. It does not require an account and does not operate a Bookmarked cloud database.

## Data stored by Bookmarked

Your library, reading progress, ratings, reviews, notes, preferences, and reading history are stored locally in the app database on your device or in your browser. This information is not uploaded to a Bookmarked server.

Bookmarked does not include advertising, behavioral analytics, or an account system.

## External services

Bookmarked contacts external services only where needed to provide the app:

- **Open Library and Archive.org** receive book searches, ISBN lookups, metadata requests, and cover-image requests. Their servers may receive ordinary network information such as your IP address and browser or device request headers.
- **Vercel** hosts the web app and may process standard web-server information when you open the PWA, such as IP address, request time, requested URL, and browser headers.
- **GitHub and Expo** may process ordinary download information when you visit the project or download an Android build.

Those services operate under their own privacy policies. Bookmarked does not receive their infrastructure logs or combine them into user profiles.

## Backups and sharing

When you choose **Share backup file**, Bookmarked creates a JSON file containing your library and reading data. The file remains under your control. If you send it through another application or cloud-storage provider, that provider may receive its contents.

Recap posters contain the reading information shown on the generated image. They are shared only when you explicitly use the share action.

## Data retention and deletion

Bookmarked cannot remotely recover your data because it has no cloud copy.

- On Android, uninstalling the app normally removes its local database.
- In a browser or PWA, clearing site data removes the local library. Browsers, particularly iOS Safari, may also evict site storage after extended disuse.
- Export backups regularly if the library matters to you.

## Questions and changes

Privacy questions and bug reports can be opened through [GitHub Issues](https://github.com/spookiedawgtechie/bookmarked/issues). Material changes to this notice will be recorded in the repository.
