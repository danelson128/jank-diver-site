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
# The download itself runs in a separate Python process: inside R on Windows,
# Python cannot make HTTPS connections (R's own SSL libraries get in the way).
#
# It makes a folder "transcripts" with one .txt file per video, and transcripts.zip
# with all of them, in the same folder as this script (or R's working directory).
# Upload the zip to Claude.
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

# ---- Work in the script's own folder when we can tell where it is ----
here <- tryCatch(dirname(normalizePath(sys.frame(1)$ofile)), error = function(e) NULL)
if (!is.null(here) && dir.exists(here)) setwd(here)

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
python <- py_config()$python
message("Using Python: ", python)

# ---- The download script (run as a separate Python process) ----
py_code <- '
import os, sys, time, zipfile

def fetch(video_id):
    from youtube_transcript_api import YouTubeTranscriptApi
    if hasattr(YouTubeTranscriptApi, "get_transcript"):  # version 0.x
        return [(x["start"], x["text"]) for x in YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])]
    data = YouTubeTranscriptApi().fetch(video_id, languages=["en"])  # version 1.x
    return [(x.start, x.text) for x in data]

if os.environ.get("JDG_TEST_FAKE"):  # only used for testing
    exec(open(os.environ["JDG_TEST_FAKE"], encoding="utf-8").read())

def fmt(seconds):
    t = int(seconds)
    h, m, s = t // 3600, t % 3600 // 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

videos = [line.rstrip("\\n").split("\\t") for line in open(sys.argv[1], encoding="utf-8") if line.strip()]
os.makedirs("transcripts", exist_ok=True)
done, failed = [], []
for name, vid in videos:
    try:
        rows = fetch(vid)
    except Exception as e:
        msg = str(e).splitlines()[0] if str(e) else ""
        failed.append(f"  {name}: https://youtu.be/{vid}")
        print(f"  FAILED  {name}  ({type(e).__name__}: {msg[:150]})", flush=True)
        continue
    # Same layout as YouTube "Show transcript": a time line, then the text.
    text = "\\n".join(f"{fmt(t)}\\n{line.replace(chr(10), chr(32))}" for t, line in rows)
    path = os.path.join("transcripts", name + ".txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"https://youtu.be/{vid}\\n{text}\\n")
    done.append(path)
    print(f"  ok      {name}  ({len(rows)} lines)", flush=True)
    time.sleep(1)  # be polite to YouTube

if done:
    with zipfile.ZipFile("transcripts.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for p in done:
            z.write(p, os.path.basename(p))
print(f"\\nDownloaded {len(done)} of {len(videos)}.")
if done:
    print("Upload this file to Claude: " + os.path.abspath("transcripts.zip"))
if failed:
    print("These failed (try again later, or copy them from YouTube by hand):")
    print("\\n".join(failed))
'
script <- tempfile(fileext = ".py")
list_file <- tempfile(fileext = ".tsv")
writeLines(py_code, script, useBytes = TRUE)
writeLines(paste(names(videos), videos, sep = "\t"), list_file, useBytes = TRUE)

# The output is collected and printed at the end: RStudio on Windows does not
# always show output from another program while it runs.
message(sprintf("Downloading %d transcripts (about a minute, please wait)...", length(videos)))
out <- suppressWarnings(system2(python, c(shQuote(script), shQuote(list_file)), stdout = TRUE, stderr = TRUE))
cat(out, sep = "\n")
status <- attr(out, "status")
if (!is.null(status) && status != 0) message("The download script stopped with an error (status ", status, ").")
