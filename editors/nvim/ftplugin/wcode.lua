-- Buffer-local settings for .wcode files.
vim.bo.commentstring = "// %s"
vim.bo.comments = "://"
-- Identifiers don't contain '-', so the default iskeyword is fine; ensure '_'.
vim.opt_local.iskeyword:append("_")
