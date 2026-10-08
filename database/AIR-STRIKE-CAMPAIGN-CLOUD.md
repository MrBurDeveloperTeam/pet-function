# Sky Patrol 关卡云同步与无限排行榜

以下 SQL 仅供检查，由你自行决定是否在 Supabase SQL Editor 执行。Codex 未连接或部署数据库。

执行顺序：

1. `air_strike_campaign_cloud.sql`：独立关卡存档、每局结算记录、金币奖励 RPC。
2. `air_strike_endless_leaderboard.sql`：依赖第一项，独立无限排行榜及读取 RPC。

不需要为这两个功能重跑旧版新增字段或完整安装 SQL。天赋云同步仍使用单独的 `air_strike_talent_cloud.sql`。
现有宿主须已有 `inventory_pet(user_id,coins)`、`mutate_pet_coins(integer)` 以及 `profiles`。请在部署前检查这些现有对象。

## 关卡

同账号最高通关关卡与无限最高波数在云端取最大值。首次接入会保存一份旧本机存档快照，只迁移进度，不补发旧奖励。新对局离线结算按账号持久排队；重新连接或点击重试后提交。金币以服务器回执为准。服务器通过账号与对局 UUID 去重，在一个事务内完成结算、解锁与钱包奖励，重传不会重复发奖。无限模式每十波结算一次，最终结算只补尚未发放的十波奖励。

## 无限排行榜

专属表 `air_strike_endless_bests` 和读取 RPC `air_strike_endless_leaderboard()`，与 `cat_dash_*` 跨栏排行榜完全分开。当独立关卡存档的无限纪录增加时，专属触发器发布最高波数；同值和更低纪录不会覆盖成绩或改变达到时间。已有云端无限成绩也会纳入榜单。

从大厅右上方 SELECT 打开关卡选择，再点击 ENDLESS LEADERBOARD。登录玩家可查看前 50 名；自己位于 50 名之外时额外显示自己的排名。显示当前玩家资料中的头像和名字，不公开邮箱。波数相同时先达到者排名靠前，再按用户 ID 稳定排序。榜单打开时每 15 秒刷新，也可手动刷新。

最高波数指游戏上报的最高到达 Wave，结算或每十波检查点同步后发布；并非每帧上传。头像加载失败显示占位。`?pet-design=1` 的本机预览不连接云端，不展示虚构全球榜单。关卡和榜单 RPC 不会改变猫咪等级，也不会改动跨栏成绩。

结果仍由客户端上报；当前方案具备身份校验、范围限制、关卡解锁和结算去重，但不是服务器验证战斗的防作弊系统。飞机改装另有 air_strike_aircraft_cloud.sql 接入，完整部署参阅 AIR-STRIKE-COMPLETE-INSTALL.md；飞行 XP、最高分与对局次数也通过现有进度 RPC 同步云端。
