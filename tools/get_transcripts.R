# Download the YouTube transcripts for the tier list videos in one go (R version).
#
# Run this on your own computer (YouTube blocks cloud servers). In R or RStudio:
#
#     source("get_transcripts.R")
#
# Or in a terminal:  Rscript get_transcripts.R
#
# The first run sets up a small private copy of Python for the download library
# (via the reticulate package). This takes a few minutes once; later runs are fast.
#
# It makes a folder "transcripts" with one .txt file per video, and transcripts.zip
# with all of them, in R's working directory (shown at the end). Upload the zip to Claude.
#
# To download other videos, add them to `videos` below: "file-name" = "VIDEO_ID".
# The video ID is the part after "youtu.be/" or "watch?v=" in the link.

videos <- c(
  # Guilds
  "azorius-guild-cards" = "_G-5WlNSySw",
  "dimir-guild-cards" = "yBBzZj8_pVw",
  "rakdos-guild-cards" = "CtdQg8a0EsQ",
  "golgari-guild-cards" = "SN1xbsWXXrA",
  "selesnya-guild-cards" = "c9X7BveYYp0",
  "gruul-guild-cards" = "TAOkvxklXVQ",
  "simic-guild-cards" = "KNkUTNFnYPM",
  # Colorless
  "colorless" = "eTOQSOLd2DM",
  # 2-drops
  "white-2-drops" = "8PqY9BJFOzw",
  "blue-2-drops" = "-JDEvCo2RUY",
  "black-2-drops" = "f44qbGNo9wM",
  "red-2-drops" = "J3GSoz-EzaI",
  "green-2-drops" = "Tu_YbmPov3k",
  # 3-drops
  "white-3-drops" = "MdQv5uLU1YE",
  "blue-3-drops" = "Qbu_bl4L2DA",
  "black-3-drops" = "JkRZU2kQRvs",
  "red-3-drops" = "ZpSRmqn1Eu4",
  "green-3-drops" = "imR1R6FAjY4",
  # Other tier lists
  "white-4-drops" = "UqPPTdFnV24",
  "secrets-of-strixhaven-set-review" = "Ch0Ny_IeTIw",
  "tmnt-set-review" = "erP-Kph-Vx4",
  "mdfc" = "wpplCIZ4LWA",
  "kor-skyfisher" = "-Yvo3_Z_DOg"
)

# ---- Set up Python and the download library (only slow the first time) ----
if (!requireNamespace("reticulate", quietly = TRUE)) {
  install.packages("reticulate", repos = "https://cloud.r-project.org")
}
library(reticulate)

if (exists("py_require", where = asNamespace("reticulate"), inherits = FALSE)) {
  # reticulate 1.41 or newer: it downloads a private Python and the library by
  # itself the first time. No Python, git or other installs needed.
  message("Setting up Python for the download library (the first run takes a few minutes)...")
  py_require("youtube-transcript-api")
} else {
  # Older reticulate: use an existing Python if there is one, otherwise Miniconda.
  env <- "jdg-transcripts"
  starter <- tryCatch(virtualenv_starter(), error = function(e) NULL)
  if (!is.null(starter)) {
    if (!virtualenv_exists(env)) {
      message("First run: setting up Python for the download library (a few minutes)...")
      virtualenv_create(env, python = starter, packages = "youtube-transcript-api")
    }
    use_virtualenv(env, required = TRUE)
  } else {
    if (!dir.exists(miniconda_path())) {
      message("First run: installing Miniconda (a private Python, a few minutes)...")
      install_miniconda()
    }
    if (!env %in% conda_list()$name) {
      conda_create(env, packages = "python=3.12")
      conda_install(env, "youtube-transcript-api", pip = TRUE)
    }
    use_condaenv(env, required = TRUE)
  }
}

# The download and the file writing run in Python, which always writes UTF-8
# (R's own file writing can garble characters like "é" on some Windows setups).
# Works with old and new versions of the library.
py_run_string('
import zipfile
def jdg_fetch(video_id):
    from youtube_transcript_api import YouTubeTranscriptApi
    if hasattr(YouTubeTranscriptApi, "get_transcript"):  # version 0.x
        return [(x["start"], x["text"]) for x in YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])]
    data = YouTubeTranscriptApi().fetch(video_id, languages=["en"])  # version 1.x
    return [(x.start, x.text) for x in data]
def jdg_fmt(seconds):
    t = int(seconds)
    h, m, s = t // 3600, t % 3600 // 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
def jdg_save(video_id, path):
    rows = jdg_fetch(video_id)
    # Same layout as YouTube\'s "Show transcript": a time line, then the text.
    text = "\\n".join(f"{jdg_fmt(t)}\\n{line.replace(chr(10), chr(32))}" for t, line in rows)
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"https://youtu.be/{video_id}\\n{text}\\n")
    return len(rows)
def jdg_try_save(video_id, path):
    # Errors are returned as text, not raised: passing a Python error into R
    # makes some Python versions print a confusing warning.
    try:
        return [jdg_save(video_id, path), ""]
    except Exception as e:
        msg = str(e).splitlines()[0] if str(e) else ""
        return [0, (type(e).__name__ + ": " + msg)[:200]]
def jdg_zip(zip_path, files):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(f, f.replace(chr(92), "/").split("/")[-1])
')
if (exists(".jdg_test_py")) py_run_string(.jdg_test_py)  # only used for testing

# ---- Download ----
dir.create("transcripts", showWarnings = FALSE)
failed <- character(0)
done <- character(0)
for (name in names(videos)) {
  id <- videos[[name]]
  path <- file.path("transcripts", paste0(name, ".txt"))
  res <- py$jdg_try_save(id, path)
  if (nzchar(res[[2]])) {
    failed <- c(failed, sprintf("  %s: https://youtu.be/%s", name, id))
    message(sprintf("  FAILED  %s  (%s)", name, res[[2]]))
    next
  }
  done <- c(done, path)
  message(sprintf("  ok      %s  (%d lines)", name, res[[1]]))
  Sys.sleep(1)  # be polite to YouTube
}

zip_path <- file.path(getwd(), "transcripts.zip")
if (length(done) > 0) py$jdg_zip(zip_path, normalizePath(done, winslash = "/"))
message(sprintf("\nDownloaded %d of %d.", length(done), length(videos)))
if (length(done) > 0) message("Upload this file to Claude: ", zip_path)
if (length(failed) > 0) {
  message("These failed (try again later, or copy them from YouTube by hand):")
  message(paste(failed, collapse = "\n"))
}
