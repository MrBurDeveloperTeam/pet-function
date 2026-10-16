# 猫咪购买、穿戴与重新进入恢复

首次安装：在 Supabase SQL Editor 手动运行同目录 `pet_wardrobe.sql`。本次完整猫咪图片切换沿用现有结构，不需要额外 migration。如果此前已安装该 SQL，本次无需再执行。

脚本保存已购买物品及每只猫的 body / neck 穿戴记录，通过服务端 RPC 校验所有权并扣金币。卸下会删除对应穿戴记录，保留购买所有权；重新进入时读取记录恢复外观。数据库只保存物品 ID，不保存图片 URL，因此图片更新不需要改玩家存档。

`rose_knit`、`sky_sailor`、`forest_vest` 和 `royal_cape` 均已接入六种猫咪的完整动画图集。首饰使用对应衣领的独立图层，衣服和首饰分别保存。游戏只保留当前使用的 WebP 素材；校验数据位于 `tests/fixtures/art/`。

本次只在本机隔离 PostgreSQL/PGlite 中验证 SQL，包括重复安装、购买扣款幂等、未购买不能穿戴、六只猫独立记录、卸下、重新读取及 RLS。没有连接或修改远程 Supabase。
