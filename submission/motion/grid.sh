#!/bin/bash
# grid.sh out.png img1 img2 ... → 2-column grid at 960px per tile
out=$1; shift
n=$#; rows=$(( (n+1)/2 ))
inputs=(); for f in "$@"; do inputs+=(-i "$f"); done
filter=""; for i in $(seq 0 $((n-1))); do filter+="[$i:v]scale=960:540[s$i];"; done
layout=""; for i in $(seq 0 $((n-1))); do x=$(( (i%2)*960 )); y=$(( (i/2)*540 )); layout+="${x}_${y}|"; done
ins=""; for i in $(seq 0 $((n-1))); do ins+="[s$i]"; done
if [ $n -eq 1 ]; then cp "$1" "$out"; exit; fi
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "${filter}${ins}xstack=inputs=$n:layout=${layout%|}:fill=black" "$out"
