# fis-command-release

## 安装

```base
npm install fis3-command-imweb -g
```

## 使用说明

```bash
fis3 imweb dev -wLc
fis3 imweb dist
```

## 更新

2015/12/24 update:

* 修复watch不到scss引用的文件(import)的bug
* 修复新增文件无法watch的bug
* 修复无法使用命令 `fis3 imweb dist` 的bug

## Usage

     Usage: fis release [media name]

     Options:

       -d, --dest <names>     release output destination
       -w, --watch            monitor the changes of project
       -L, --live             automatically reload your browser
       -c, --clean            clean compile cache
       -u, --unique           use unique compile caching
