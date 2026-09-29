# 2026-09-29 - Closing an account takes their pictures with it

Closing an account (`DELETE /api/auth/delete-account`, fixed earlier today)
cleared the links to the person's pictures from their profile but left the
pictures. Measured on production:

- the files stayed in Storage. The profile photo a player uploads lives under
  `social-media` `avatars/<id>/`, and anon can list `social-media` `avatars/%`
  (policy `preset_avatars_are_listable`, there for the preset gallery):
  listing `avatars` with an id as the search finds that id's folder, and
  listing the folder finds the photo. So a closed account's photo stayed
  findable by anyone who knows the id. Covers (`covers/<id>/`), a generated
  avatar (`avatars` bucket, `<id>/`) and avatars made from a player's photo,
  words or an edit (`custom-avatars` `generated/likeness_<id>_`, `<id>_`,
  `edited_<id>_`) stayed too;
- the avatar record (`user_avatars`: the custom avatar's image link and the
  words that described them) and the profile editor's media library
  (`user_media`, `user_albums`) stayed.

## This change

- Club Arena migration `20260929070440_closing_an_account_takes_their_pictures`:
  `fn_close_account` also deletes the person's `user_avatars`, `user_media`
  and `user_albums` rows, in the same transaction.
- This endpoint removes the files through the Storage API once
  `fn_close_account` has answered ok (also on a retry) and before the login
  goes. `theirPictures(id)` names every place, each keyed by the person's id;
  every listed name is checked against the exact prefix before it is removed,
  because the Storage search is case-insensitive and treats `_` as a
  wildcard. Not `user-media` `<id>/messages/` or `<id>/bankroll/`: those
  belong to conversations and records that stay.
- A file that cannot be listed or removed does not keep the account open: the
  login still goes, the failure is logged and reported, and the erasure
  request stays `anonymized` instead of `completed` so support can see it and
  finish. The response carries `picturesRemoved`.

## Tests

`__tests__/delete-account-closes-the-account.test.mjs` runs the real handler
against a Storage double with the server's list semantics (checked against
production with the anon key: the folder listing, the search as a
case-insensitive prefix, files with an id and folders without one). It holds:
every picture of theirs goes and every other file stays (someone else's, the
person's posted photos, message attachments and bankroll records, and a
wildcard near-miss); the order is database, pictures, login, erasure record;
more than a page goes; a page of kept files does not hide the pictures after
it; a failure is reported, keeps the request open and still closes the
account; a refusal touches no picture. Each of the three guards was mutated
out and the tests failed.
