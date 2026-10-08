# 飞机游戏完整云端安装

请打开 `air_strike_complete_install.sql`，检查后整份复制到 Supabase SQL Editor，由你决定是否执行。Codex 未连接 Supabase、未部署 SQL、未进行实际金币交易。

你已执行过旧飞机升级 SQL，也可以使用这份完整文件。它包含所需基础建表、兼容的飞机字段、飞机云购买、天赋云购买、关卡存档与奖励、无限排行榜。无需另外重跑旧的新增字段或完整安装文件。整个文件只有一个事务，发生错误全部回滚。重复运行不会重置已有等级、天赋、关卡或排行，也不会自动扣币。

前提是猫咪页面已有 `public.inventory_pet(user_id,coins)`、`public.mutate_pet_coins(integer)` 和 `public.profiles`。脚本先检查这些现有对象，不创建另一套钱包，不覆盖你的猫咪钱包函数。缺少时会给出错误，不能当作安装成功。

## 包含内容

- 飞机改装：`air_strike_progress.aircraft_tier`，1–10 等，独立于猫咪等级。逐级升级价格为 100、200、350、550、800、1100、1500、2000、2600 猫咪金币。
- 永久天赋：`air_strike_talent_ownership`，15 项按 1→15 顺序购买；价格为 100、200、300、400、500、600、700、800、1400、2000、2600、3200、3800、4400、5000 猫咪金币。
- 购买接口：服务器读取真实账号、固定价格、检查余额、锁定记录，在一个事务内扣猫咪金币并授予飞机/天赋。重复提交同一飞机目标等级或已拥有天赋不会再次扣款。
- 关卡云端存档、按对局 UUID 去重的奖励结算、每十波无限奖励与断网提交队列。
- 独立 `air_strike_endless_bests` 排行榜，显示头像、名称、最高到达波数。没有修改任何跨栏 `cat_dash_*` 表或接口。

前端已接入飞机、天赋、关卡与排行榜接口。飞行 XP、一般最高分与对局次数也通过已部署的 air_strike_progress_sync 接入云端，按最大值合并，不关联猫咪等级。

## 旧购买记录

旧版飞机与天赋可能已经扣过猫咪金币，但只保存在浏览器。这些记录不能自动证明已付费，程序不会免费上传，也不会自动再次收费。首次连接云端会保留本机备份；发现本机等级/天赋高于云端时暂停购买并提示你核对。

若出现这种提示，先核对真实用户 UUID 和已购买内容，再自行执行以下**单独的管理员迁移**（不要直接执行示例占位内容）：

```sql
-- 把 UUID 与已确认购买的等级替换为真实值，范围 1–10。
insert into public.air_strike_progress(user_id,aircraft_tier)
values('YOUR-AUTH-USER-UUID'::uuid,3)
on conflict(user_id) do update set
 aircraft_tier=greatest(air_strike_progress.aircraft_tier,excluded.aircraft_tier),updated_at=now();

-- 如已确认购买了前 3 项天赋：替换 UUID 和数组，不扣币。
insert into public.air_strike_talent_ownership(user_id,talents)
values('YOUR-AUTH-USER-UUID'::uuid,array[1,2,3])
on conflict(user_id) do update set talents=(
 select array_agg(distinct id order by id)
 from unnest(public.air_strike_talent_ownership.talents || excluded.talents) as items(id)
),updated_at=now();
```

这不是普通用户可调用的免费升级接口。审核迁移后在维修台/天赋榜点击重新读取云端。

## 部署后检查

使用真实登录的猫咪页面（`?pet-design=1` 本机设计预览不会连接数据库）。打开维修台和天赋榜，确认显示已同步云端。购买后确认猫咪金币与飞机/天赋同时更新，换设备重新登录确认仍保留。排行榜入口位于大厅 SELECT → ENDLESS LEADERBOARD；打开后每 15 秒刷新。

当前关卡和波数由游戏客户端上报，服务器校验身份、范围、解锁条件及结算去重；这不是服务器模拟战斗的防作弊验证。SQL 在本地进行了静态检查，尚未在你的 Supabase 实际执行。
