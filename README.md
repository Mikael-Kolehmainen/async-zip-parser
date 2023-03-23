# async-zip-parser

This package was created for my use case that couldn't be handled by [node-unzipper](https://github.com/ZJONSSON/node-unzipper)
because of a bug in node v18 and higher with the Parse function and async iterators.

The bug was that the function threw the following error:
[ERR_STREAM_PREMATURE_CLOSE]: Premature close

When the Parse function was used with async iterators, in my edited version of the code the bug doesn't exist.

Most of the code is copied from node-unzipper but I made some optimizations and updates according to my needs.