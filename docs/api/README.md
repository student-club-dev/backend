# API specs

Mobile app API specifications (endpoints + JSON structures). Source material for backend implementation.

Two separate mobile apps share one backend:

| Folder | App | Audience |
|--------|-----|----------|
| `provider/` | Ad-posting app | Users who publish listings (businesses, specialists) |
| `client/` | Client app | Consumers (mostly students) who browse and contact |

Drop the mobile `.md` spec files into the matching folder. The backend reads these to build controllers, DTOs, and Swagger.

## URL convention (draft — finalize during API design)

```
https://api.<domain>/<app>/v1/<resource>
```

- `<app>` = `provider` or `client`
- Example: `/provider/v1/advertisements`, `/client/v1/advertisements`
- Base URL stays constant per app; the `<app>` segment differs between the two apps; `v1` is the API version.
