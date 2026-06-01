-- Neovim integration for the .wcode wirescript language.
--
--   require('wcode').setup({
--     server_path  = '/path/to/wirescript/packages/server/out/server.js',
--     compiler_path = 'wiremod-scheme',     -- for live diagnostics
--   })
--
-- Highlighting works out of the box from syntax/wcode.vim; install the
-- tree-sitter parser (see below / the README) for semantic highlighting.

local M = {}

-- Resolve this plugin's root: …/editors/nvim (this file is lua/wcode/init.lua).
local function plugin_root()
  local source = debug.getinfo(1, "S").source:sub(2)
  return vim.fn.fnamemodify(source, ":h:h:h")
end

local function default_server_path(root)
  return vim.fn.fnamemodify(root .. "/../../packages/server/out/server.js", ":p")
end

local function buf_root_dir(bufnr)
  local fname = vim.api.nvim_buf_get_name(bufnr)
  if fname == "" then
    return vim.fn.getcwd()
  end
  local markers = vim.fs.find({ ".git", "Cargo.toml" }, { upward = true, path = fname })
  if markers and markers[1] then
    return vim.fs.dirname(markers[1])
  end
  return vim.fs.dirname(fname)
end

local function setup_lsp(opts, root)
  local server = opts.server_path and vim.fn.expand(opts.server_path) or default_server_path(root)
  local cmd = opts.server_cmd or { "node", server, "--stdio" }

  if not opts.server_cmd and vim.fn.filereadable(server) == 0 then
    vim.notify(
      "wcode: language server not found at " .. server .. "\n"
        .. "Run `npm install && npm run build` in the wirescript repo, "
        .. "or pass server_path to require('wcode').setup{}.",
      vim.log.levels.WARN
    )
    return
  end

  local settings = {
    wcode = {
      compilerPath = opts.compiler_path or "wiremod-scheme",
      diagnostics = {
        enable = opts.diagnostics ~= false,
        run = opts.diagnostics_run or "onSave",
      },
    },
  }

  local group = vim.api.nvim_create_augroup("wcode_lsp", { clear = true })
  vim.api.nvim_create_autocmd("FileType", {
    group = group,
    pattern = "wcode",
    callback = function(args)
      vim.lsp.start({
        name = "wcode",
        cmd = cmd,
        root_dir = buf_root_dir(args.buf),
        settings = settings,
        init_options = settings,
      }, { bufnr = args.buf })
    end,
  })
end

-- Register the tree-sitter parser with nvim-treesitter, if it's available.
local function setup_treesitter(opts, root)
  local ok, parsers = pcall(require, "nvim-treesitter.parsers")
  if not ok then
    return
  end
  local configs = parsers.get_parser_configs()
  configs.wcode = {
    install_info = {
      url = opts.treesitter_path and vim.fn.expand(opts.treesitter_path)
        or vim.fn.fnamemodify(root .. "/../../tree-sitter-wcode", ":p"),
      files = { "src/parser.c" },
      branch = "main",
      generate_requires_npm = false,
    },
    filetype = "wcode",
  }
end

function M.setup(opts)
  opts = opts or {}
  local root = opts.root and vim.fn.expand(opts.root) or plugin_root()

  -- Filetype detection (also covered by ftdetect/, but harmless to repeat).
  vim.filetype.add({ extension = { wcode = "wcode" } })

  if opts.treesitter ~= false then
    setup_treesitter(opts, root)
  end
  if opts.lsp ~= false then
    setup_lsp(opts, root)
  end
end

return M
