# 品牌资源规范

## 目录结构
- 每个品牌一个目录：`assests/<BrandFolder>/`
- 品牌 Logo 文件固定命名：`Logo.svg`

## 字体文件命名
- 统一命名：`<FontPrefix>-Regular.ttf`
- 统一命名：`<FontPrefix>-Medium.ttf`
- 统一命名：`<FontPrefix>-SemiBold.ttf`

示例：
- `assests/Google/Google-Regular.ttf`
- `assests/Google/Google-Medium.ttf`
- `assests/Google/Google-SemiBold.ttf`

## 品牌配置 brands.json
每个品牌建议包含：
- `id`: 机器识别 ID（小写英文）
- `name`: 下拉显示名称（可中文）
- `folder`: 对应资源目录名
- `fontPrefix`: 字体文件前缀（没有独有字体可省略）
- `keywords`: 自动匹配机型关键字
- `logoWidth`: Logo 绘制宽度

## 回退规则
- 默认加载 Google 字体。
- 选中品牌后再尝试加载该品牌字体。
- 若品牌无字体，自动回退到 Google，再回退系统字体（并可利用 Xiaomi 字体作为补充回退）。
