# Darktable Transition
A wrapper around [darktable-cli](https://www.darktable.org/usermanual/en/overview_chapter.html#darktable_cli_commandline_parameters) to smoothly transit from one key frame to another. Initially designed for time-lapse videos.

## Problem addressed
Following my hobby as an amature photographer, I needed a software to edit my time-lapse shots. While [darktable](https://www.darktable.org/) is perfect for single shots, it is not designed for time-lapses where there are hunddreds of images unless you want to apply the same styles to all of the frames or specify each individual file's style separately and manually. Thankfully, darktable comes with a cli version as well which can be used for automating a process. And that's what I've used in this project to transit from one style to another across the shots of a time-lapse. In other words, using this script you can provide styles for a few of the key frames in your time-lapse and the script will interpolate the styles for the frame in between smoothly (using a spline).

## How to use
The easiest way to use this script is to follow a series of steps:

**1.** Copy all your image files into one single folder

Seems obvious, but it is necessary that all your images (time-lapse frames) are within one single folder. And while the filenames are not important, their order is. In order to prevent any issues, make sure that your filenames follow the logical order of progress (chronological order). Also, it is recommended that all the filenames are of the same length. For examples:
```
001.png
002.png
003.png
```

**2.** Come up with your styles in darktable

Open the folder with images in it in darktable. This action will create `.xmp` files for all and every images in that folder. It is important that each image is accompanied with its `.xmp` like this:

```
001.png.xmp
002.png.xmp
003.png.xmp
```

But you don't need to worry about this as darktable will take care of it.

Next, choose few of the images (frames) that you want to use as key frames. Edit them in darktable and make them look as you please. This will store the editing as a list of operations within the corresponding `.xmp`. You need to understand that the images are not edited at this point. BTW, you don't need to do anything for the operations to be saved in the `.xmp`. This will happen by darktable as soon as you close the application or move away from `darkroom`.

Let's say you have 100 frames (`001.png` to `100.png`) and you want to have three key frames; `001.png`, `050.png`, and `100.png`. You should edit those three images in darktable and make them the way you like. Another important thing to remember is that **only the shared operations will be used by the script**. It means if you want the exposure operation be used by the script, it should be enabled in all of the key frames.

**3.** Run the script

The only left is to run the script. First, make sure the packages are installed:

```
npm install
```

The complete list of arguments supported by the script can be found in the next section but here I'm going to use the bare minimum:

```
node index.js --folder ~/Pictures/time-lapse --keyframes="001.png,050.png,100.png" --ext png
```

This command will create a folder called `output` within the source folder and will apply the operations mentioned in the key frames to all the images from `001.png` to `100.png`. In order to interpolate the parameters for the operations between key frames, spline is used.

## Complete list of arguments

* `--folder`: The path to the folder holding the source images
* `--keyframe`: A comma seperated list of image filenames that should be used as key frames
* `--ext`: The extension of the files to be used as the source iamges
* `--output`: The path to save the result images - defaults to `${source}/output`
* `--concurrency`: An integer indicating the number of images to work on at the same time (to make a better use of your CPU cores) - defaults to your number of CPU cores / 4

The following arguments will be passed to `darktable-cli` if they are present:

* `--width`
* `--height`
* `--bpp`
* `--hq`
* `--upscale`
* `--core`

### Be creative and have fun
