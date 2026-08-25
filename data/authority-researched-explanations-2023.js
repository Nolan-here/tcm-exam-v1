import { QUESTIONS_2023 } from '../js/questions-2023.js';
import { AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS } from '../js/authority-researched-explanation-backfills.js';

export const AUTHORITY_SOURCE_LEVELS = {
  S: '国家或政府部门正式规范、法规、标准及其官方发布页',
  A: '规划教材、高校正式教学资源、政府卫生机构或国家级课程资源',
  B: '高校学报、三级医院或经专家审核的专业知识平台',
  C: '正规医学期刊或其他可追溯学术资料',
  辅助: '普通考试教学资料，仅作辅助交叉核对，不得作为唯一或核心依据',
};

export const AUTHORITY_SOURCE_CATALOG = {
  bucm_xiaoyao: { level: 'A', organization: '北京中医药大学国家中医国际传播中心', title: '逍遥散', url: 'https://tcmculture.bucm.edu.cn/zyywhkp/yxsbj/80624.htm', publishedOrYear: '2023-04-19', coreSupport: '逍遥散肝郁化火加牡丹皮、栀子的加减原则' },
  zcmu_materia_medica: { level: 'A', organization: '浙江中医药大学', title: '中医住院医师规范化培训手册（中药学）', url: 'https://jjzx.zcmu.edu.cn/__local/9/CD/72/AB29963E6A1EF586DAAF27F8E9E_8CC4BE6E_182936.pdf?e=.pdf', publishedOrYear: '未标明', coreSupport: '红花功效、用法及孕妇慎用' },
  tsinghua_tcm_contraindications: { level: 'A', organization: '清华大学医院', title: '中药用药禁忌主要有以下几个方面', url: 'https://xyy.tsinghua.edu.cn/info/1045/4149.htm', publishedOrYear: '未标明', coreSupport: '妊娠慎用药明确列有红花，并说明活血祛瘀药的妊娠用药风险' },
  sanming_decoction: { level: 'S', organization: '三明市人民政府', title: '中药煎煮有哪些讲究？', url: 'https://www.sm.gov.cn/wz/hdjlzsk/sgsj/ggjg_29426/202211/t20221122_1848878.htm', publishedOrYear: '2022-11-22', coreSupport: '阿胶烊化、蒲黄包煎等特殊煎服法' },
  dayi_xueyutan: { level: 'B', organization: '中国医药信息查询平台', title: '血余炭', url: 'https://s.dayi.org.cn/mip/s/cmedical/305058.html', publishedOrYear: '未标明', coreSupport: '血余炭可煎汤或研末内服' },
  dayi_phlegm_lung: { level: 'B', organization: '中国医药信息查询平台', title: '痰湿蕴肺证', url: 'https://s.dayi.org.cn/mip/s/symptom/1006050.html', publishedOrYear: '未标明', coreSupport: '咳声重浊、痰多色白及痰湿阻肺病机' },
  ahtcm_formula_songs: { level: 'A', organization: '安徽中医药大学国家级一流本科课程展示平台', title: '方剂歌诀', url: 'https://gjjk.ahtcm.edu.cn/__local/E/84/6C/1072DF73084204367432706B45B_DC3F4202_75A90.pdf', publishedOrYear: '未标明', coreSupport: '归脾汤、补阳还五汤、葛根芩连汤等方剂组成与功用' },
  zzsqmc_yinyang: { level: 'A', organization: '郑州健康学院', title: '阴阳学说基本内容（互根）课后习题', url: 'https://www.zzsqmc.edu.cn/info/1827/2866.htm', publishedOrYear: '未标明', coreSupport: '阴阳皆消皆长由互根互用决定' },
  bucm_skin_scale: { level: 'B', organization: '北京中医药大学学报（中医临床版）', title: '肌肤甲错非独瘀血', url: 'https://xblc.bucm.edu.cn/rc-pub/front/front-article/download/40515928/lowqualitypdf/Scaly%20dry%20skin%20is%20not%20only%20about%20blood%20stasis.pdf', publishedOrYear: '未标明', coreSupport: '肌肤甲错与瘀血、气血失养及津液失润的辨析' },
  ahtcm_diagnosis_course: { level: 'A', organization: '安徽中医药大学国家级一流本科课程展示平台', title: '中医学概论中医诊断习题训练', url: 'https://gjjk.ahtcm.edu.cn/zyxgl/jxzy/xxzy1/xtxl.htm', publishedOrYear: '未标明', coreSupport: '五更泄泻与脾肾阳虚、癃闭定义等诊断要点' },
  jxutcm_cold_damp_spleen: { level: 'A', organization: '江西中医药大学何晓晖名医工作室', title: '寒湿困脾证', url: 'https://hxhmygzs.jxutcm.edu.cn/info/1004/1488.htm', publishedOrYear: '未标明', coreSupport: '寒湿困脾的症状、舌脉及病机' },
  zzsqmc_liver_system: { level: 'A', organization: '郑州健康学院', title: '肝的系统联系课后习题', url: 'https://www.zzsqmc.edu.cn/info/1827/2914.htm', publishedOrYear: '未标明', coreSupport: '肝主筋、爪为筋之余' },
  zibo_sah: { level: 'S', organization: '淄博市卫生健康委员会', title: '蛛网膜下腔出血', url: 'https://ws.zibo.gov.cn/art/2024/8/8/art_1336_2836366.html', publishedOrYear: '2024-08-08', coreSupport: '蛛网膜下腔出血首选头颅CT快速确诊' },
  beijing_sah: { level: 'S', organization: '北京市卫生健康委员会', title: '少见的中脑周围非动脉瘤性蛛网膜下腔出血病例科普', url: 'https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jksh/202407/t20240715_3750449.html', publishedOrYear: '2024-07-15', coreSupport: '急性期头颅CT敏感，可作为蛛网膜下腔出血首选检查' },
  lnpc_tb_imaging: { level: 'A', organization: '辽宁石化职业技术学院', title: '肺结核常识', url: 'https://www.lnpc.edu.cn/hqglc/2023/0330/c806a19885/page.htm', publishedOrYear: '2023-03-30', coreSupport: '原发综合征的肺内渗出、淋巴管炎和肺门淋巴结肿大哑铃状改变；慢性或亚急性血行播散型肺结核病灶大小、新旧和分布不一' },
  shutcm_curriculum: { level: 'A', organization: '上海中医药大学', title: '本科课程教学大纲汇编', url: 'https://jwc.shutcm.edu.cn/_upload/article/files/74/03/2ecd75ea47469d82f690d56bcdda/05f31bde-e615-4515-a1cc-bbfe6cbe36fe.pdf', publishedOrYear: '2017', coreSupport: '内外妇儿及中医内科学的规划教材口径和辨证要点' },
  beijing_gov_medical_dispute: { level: 'S', organization: '北京市人民政府门户网站（国务院文件）', title: '医疗纠纷预防和处理条例', url: 'https://www.beijing.gov.cn/zhengce/zhengcefagui/201905/t20190522_61432.html', publishedOrYear: '2018-08-17', effectiveOn: '2018-10-01', applicableIn2023: true, coreSupport: '国务院令第701号第十三条的病情和医疗措施说明义务，以及第二十条的患者配合诊疗义务' },
  tsinghua_medical_ethics: { level: 'A', organization: '清华大学出版社', title: '医学伦理学（第2版）试读', url: 'https://www.tup.tsinghua.edu.cn/upload/books/yz/078294-01.pdf', publishedOrYear: '2018', coreSupport: '医患权利义务、内心信念与医德评价' },
  beijing_pancreatitis: { level: 'S', organization: '北京市卫生健康委员会', title: '医生，我到底得没得急性胰腺炎啊？', url: 'https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jksh/202211/t20221109_2854290.html', publishedOrYear: '2022-11-09', coreSupport: '急性胰腺炎腹痛、胰酶和影像诊断标准' },
  zcmu_status_epilepticus: { level: 'A', organization: '浙江中医药大学', title: '耐药性癫痫研究进展', url: 'https://www.zcmu.edu.cn/info/10498/11761.htm', publishedOrYear: '2025-05-22', coreSupport: '癫痫持续状态首选静脉苯二氮䓬类地西泮' },
  caae_epilepsy: { level: 'B', organization: '中国抗癫痫协会', title: '癫痫知识——专业医生为患者和家属解读', url: 'https://www.caae.org.cn/Public/Uploads/20201112/video/5faca5b1064df.pdf', publishedOrYear: '2020', coreSupport: '全面强直-阵挛发作以意识丧失和全身强直、抽搐为特征，个别患者出现尿失禁' },
  zqmc_health_assessment: { level: 'A', organization: '肇庆医学高等专科学校', title: '健康评估活页教材', url: 'https://yanshou.zqmc.edu.cn/__local/C/A6/FA/B450A2A484C93B6F80D79B03676_1054656F_16401B.pdf', publishedOrYear: '未标明', accessNote: '已通过网页索引打开并核对PDF第52至53页；站点对命令行直连返回空响应', coreSupport: '胸骨左缘第3、4肋间收缩期震颤提示室间隔缺损' },
  zqmc_pediatric_nursing: { level: 'A', organization: '肇庆医学高等专科学校', title: '儿科护理学工作手册', url: 'https://yanshou.zqmc.edu.cn/__local/3/3A/E1/4E3E11D0C7DFC89BB3B0AB13125_B59A11CB_ADA8B.pdf', publishedOrYear: '未标明', accessNote: '已通过网页索引打开并核对PDF第82至84页；站点对命令行直连返回空响应', coreSupport: '室间隔缺损杂音和收缩期震颤' },
  smu_urine_casts: { level: 'A', organization: '南方医科大学', title: '尿液管型的形成及临床意义', url: 'https://aike.smu.edu.cn/pluginfile.php/284869/mod_resource/content/0/%E4%BB%98%E4%BA%AE%20%E4%BA%94%E9%99%84%E9%99%A2%20%E6%B6%B2%E7%AE%A1%E5%9E%8B%E7%9A%84%E5%BD%A2%E6%88%90%E5%8F%8A%E4%B8%B4%E5%BA%8A%E6%84%8F%E4%B9%89%20%E8%AE%B2%E7%A8%BF.pdf', publishedOrYear: '未标明', coreSupport: '白细胞管型提示肾间质炎症并常见于急性肾盂肾炎' },
  lzu_terminal_disinfection: { level: 'A', organization: '兰州大学护理学院', title: '医务工作者必读', url: 'https://nursing.lzu.edu.cn/hlxy/upload/files/N20170603140924.pdf', publishedOrYear: '2017', coreSupport: '终末消毒定义及患者出院前沐浴处理' },
  xxmu_jaundice: { level: 'A', organization: '新乡医学院', title: '黄疸教学课件', url: 'https://www.xxmu.edu.cn/__local/9/CF/2E/B8346E054802D8B3C9524F87EA8_D151E4DC_A350A.pdf', publishedOrYear: '未标明', coreSupport: '胆道完全阻塞与陶土样便' },
  fudan_breast_cancer: { level: 'A', organization: '复旦大学病理标本馆', title: '关于乳腺癌，每一个女性都要知道的事情', url: 'https://binglibiaobenguan.fudan.edu.cn/02/3e/c30842a328254/page.htm', publishedOrYear: '未标明', coreSupport: '乳腺癌淋巴回流障碍形成橘皮样改变' },
  yanan_urinalysis: { level: 'B', organization: '延安市中医医院', title: '小检查大作用——尿常规检查', url: 'https://yaszyyy.com/jkjy/zykp/1862307506294894593.html', publishedOrYear: '2024-11-29', coreSupport: '尿液细胞成分对泌尿系统定位诊断的意义' },
  tsinghua_acarbose: { level: 'A', organization: '清华大学医院', title: '阿卡波糖片', url: 'https://xyy.tsinghua.edu.cn/info/1055/6598.htm', publishedOrYear: '2025-06-20', coreSupport: '阿卡波糖降低餐后血糖及用法' },
  smmu_alt: { level: 'B', organization: '海军军医大学《药学实践与服务》', title: '肝损伤指标相关研究', url: 'https://yxsj.smmu.edu.cn/fileYXSJZZ/journal/article/yxsjzz/2024/12/PDF/202305008yangnian.pdf', publishedOrYear: '2024', coreSupport: 'ALT主要分布于肝细胞胞浆和线粒体' },
  gxtcmu_ecg: { level: 'A', organization: '广西中医药大学', title: '病理学教学设计：心肌梗死病例', url: 'https://www.gxtcmu.edu.cn/rklc/jysjs/blxjys/jxyhygl13/blx/content_31832', publishedOrYear: '未标明', coreSupport: 'V1至V6导联改变提示广泛前壁心肌梗死' },
  jzmu_uremia: { level: 'A', organization: '锦州医科大学', title: '慢性肾衰竭与尿毒症教学课件', url: 'https://jcxy.jzmu.edu.cn/__local/9/44/9F/924E0CD5CCC73A74515764A9962_308E4899_15E4D6.pdf?e=.pdf', publishedOrYear: '未标明', coreSupport: '尿毒症呼出气体有氨味' },
  lf_formula_textbook: { level: 'A', organization: '廊坊市中医医院公开的全国中医药行业高等教育规划教材', title: '方剂学（十三五规划教材）', url: 'https://www.lfhospital.net/Uploads/Picture/2024-12-09/%E6%96%B9%E5%89%82%E5%AD%A6.pdf', publishedOrYear: '2016', coreSupport: '甘麦大枣汤功用、主治及方解' },
  lnc_acupuncture: { level: 'A', organization: '广东岭南职业技术学院', title: '针灸学学习指导', url: 'https://exp.lnc.edu.cn/suite/solver/classView.do?action=browse&blockKey=32822058&cleanSession=true&feature=blockItem&key=32859256&menuNavKey=32822463&siteKey=32709677', publishedOrYear: '未标明', coreSupport: '三焦募穴石门、血会膈俞、三焦下合穴委阳等腧穴归属' },
  ahtcm_acupoints: { level: 'A', organization: '安徽中医药大学针灸骨伤临床学院', title: '经络腧穴学教学课件', url: 'https://gjjk.ahtcm.edu.cn/__local/5/65/41/B9263D80D2AD359AC49B47C0A49_6C17C06C_D1B13A.pdf', publishedOrYear: '未标明', coreSupport: '募穴课件说明三焦募穴石门，八会穴课件列明血会膈俞' },
  gxtcmu_surgery: { level: 'A', organization: '广西中医药大学第一附属医院', title: '中医外科学教学大纲', url: 'https://www.gxtcmu.edu.cn/dylc/jysjs/zywkx/jxyhygl2/zywkx1/jxdg5/content_49406', publishedOrYear: '未标明', coreSupport: '丹毒临床特点、证型治法及化斑解毒汤等方药' },
  gxtcmu_combined_surgery: { level: 'A', organization: '广西中医药大学第二临床医学院', title: '中西医结合外科学课程教学大纲', url: 'https://www.gxtcmu.edu.cn/rklc/jysjs/wkxjys/jcjsyyzjxzygx1/jcjs1/content_32284', publishedOrYear: '未标明', coreSupport: '药物性皮炎诊断和麻疹样型等分型' },
  xuzhou_drug_rash: { level: 'B', organization: '徐州医学院学报', title: '104例药疹临床分析', url: 'https://xb.xzhmu.edu.cn/cn/article/pdf/preview/20072709014huangkan.pdf', publishedOrYear: '2007', coreSupport: '解热镇痛药致敏及麻疹样药疹分型' },
  njucm_infertility: { level: 'B', organization: '南京中医药大学学报', title: '补肾育阴调冲方治疗肾阴虚型卵巢储备功能下降不孕', url: 'https://xb.njucm.edu.cn/cn/article/id/88f1bdce-0b4c-4c5b-bf24-97f3f5130a9b', publishedOrYear: '2024', coreSupport: '肾阴虚不孕的滋阴补肾、调冲治疗' },
  hactcm_infertility: { level: 'A', organization: '河南中医药大学', title: '庞清治治疗不孕症经验', url: 'https://zyywh.hactcm.edu.cn/info/1004/1103.htm', publishedOrYear: '未标明', coreSupport: '肝肾阴虚不孕表现及滋补肝肾、养精益冲任治法' },
  med66_pertussis: { level: '辅助', organization: '正保医学教育网', title: '顿咳的分证论治', url: 'https://www.med66.com/new/40a185aa2011/201117yuchan20349.shtml', publishedOrYear: '2011', coreSupport: '顿咳痉咳期清热泻肺、涤痰镇咳' },
  dayi_zhengjia: { level: 'B', organization: '中国医药信息查询平台', title: '癥瘕', url: 'https://www.dayi.org.cn/disease/1157440', publishedOrYear: '未标明', coreSupport: '癥瘕定义、痰湿瘀结证和辨证治疗' },
  med66_postpartum: { level: '辅助', organization: '正保医学教育网', title: '产后发热知识点', url: 'https://www.med66.com/zhongyiyishi/fudaopeixun/zh2203175093.shtml', publishedOrYear: '2022-03-17', coreSupport: '感染邪毒型产后发热的高热寒战、臭秽恶露等特征' },
  btmc_pediatrics: { level: 'A', organization: '包头医学院', title: '中医儿科学教学大纲', url: 'https://www.btmc.edu.cn/__local/A/8D/D4/409FC7AC210DB4EE58F106F30AD_94CA64CA_9BA43F.pdf?e=.pdf', publishedOrYear: '未标明', coreSupport: '急性肾炎邪陷心肝、水毒内闭变证及治法，鹅口疮心脾积热及清心泻火治则' },
  enteric_fever_textbook: { level: 'A', organization: '科学出版社高等医学院校教材', title: '传染病学试读', url: 'https://www.ecsponline.com/yz/B1360FD9B4CDD41AB996B53FAF7B2B43F000.pdf', publishedOrYear: '未标明', coreSupport: '伤寒稽留热、弛张热所处病程阶段的教材口径' },
  beijing_fever_patterns: { level: 'B', organization: '北京党员教育健康驿站', title: '发热可分为哪几种类型？', url: 'https://www.bjcc.gov.cn/article/400004897.html', publishedOrYear: '2020-04-26', coreSupport: '稽留热、弛张热定义及伤寒极期相关性' },
  hactcm_acute_bronchitis: { level: 'A', organization: '河南中医药大学呼吸疾病中医药防治省部共建协同创新中心', title: '急性气管-支气管炎中医诊疗指南（2021版）', url: 'https://cmrd.hactcm.edu.cn/2.jixingqiguan-zhiqiguanyanzhongyizhenliaozhinan.pdf', publishedOrYear: '2021', coreSupport: '痰热壅肺证直接列出咳嗽、痰黄黏稠及咯痰不爽，痰湿阻肺则为痰多白黏且易咯出' },
  tcm_diagnostics_seventh: { level: 'A', organization: '全国高等中医药院校规划教材《中医诊断学》第七版', title: '中医诊断学（第七版）', url: 'https://download.s21i.co99.net/18803350/0/0/ABUIABA9GAAgpbrilwYo4NTgpwc.pdf?f=%E4%B8%AD%E5%8C%BB%E8%AF%8A%E6%96%AD%E5%AD%A6%28%E7%AC%AC%E4%B8%83%E7%89%88%29.pdf&v=1660460345', publishedOrYear: '第七版', accessNote: '已实际打开公开扫描件并核对闻诊正文；URL为第三方镜像，教材书目另由出版社页面核实', coreSupport: '咳声不扬、痰稠色黄、不易咯出，多因热邪犯肺、肺津被灼所致' },
  sstp_tcm_diagnostics_catalog: { level: 'A', organization: '上海科学技术出版社', title: '中医诊断学图书信息', url: 'https://www.sstp.com.cn/C_medicine2/557.html', publishedOrYear: '2008-03-01', coreSupport: '出版社书目核实《中医诊断学》、主编朱文锋及ISBN' },
  shutcm_acupuncture_syllabus: { level: 'A', organization: '上海中医药大学', title: '针灸治疗学课程教学大纲', url: 'https://jwc.shutcm.edu.cn/_upload/article/files/8c/f3/3c4a54d844e19b0ba84c8f16a050/30304507-8ba9-43c7-82e3-4ae259cf7ea7.pdf', publishedOrYear: '2017', coreSupport: '补虚泻实原则下直接列有虚则补之、实则泻之、陷下则灸之' },
  ctext_lingshu: { level: 'C', organization: '中国哲学书电子化计划', title: '《黄帝内经·灵枢经·论疾诊尺》', url: 'https://ctext.org/huangdi-neijing/lun-ji-zhen-chi/zhs', publishedOrYear: '经典原文', coreSupport: '尺肤粗如枯鱼之鳞者为水泆饮；按手足上窅而不起者为风水肤胀' },
  bucm_water_edema: { level: 'A', organization: '北京中医药大学', title: '《内经》中水肿证的认识', url: 'https://www.bucm.edu.cn/kxyj/3ac2016648c6461fb1a2d5915b09ac77.htm', publishedOrYear: '2012-12-06', coreSupport: '引《灵枢》说明按手足窅而不起为风水肤胀，并解释按之有窝' },
  bucm_dianbing_course: { level: 'A', organization: '北京中医药大学远程教育学院', title: '癫狂课程教学内容', url: 'https://jxjyxb.bucm.edu.cn/ibucm/zhengwen/update/1_13b.htm', publishedOrYear: '未标明', coreSupport: '癫病以精神抑郁、表情淡漠、沉默痴呆为特征，病理以痰气郁结为主' },
  cacm_phlegm_qi_treatment: { level: 'B', organization: '中华中医药学会中医药临床案例成果库', title: '化痰醒神法治疗阿斯伯格综合征验案一则', url: 'https://cccl-tcm.cacm.org.cn/rc-pub/front/front-article/download/40358243/lowqualitypdf/%E5%8C%96%E7%97%B0%E9%86%92%E7%A5%9E%E6%B3%95%E6%B2%BB%E7%96%97%E9%98%BF%E6%96%AF%E4%BC%AF%E6%A0%BC%E7%BB%BC%E5%90%88%E5%BE%81%E9%AA%8C%E6%A1%88%E4%B8%80%E5%88%99.pdf', publishedOrYear: '2023', coreSupport: '癫病气郁痰结证的诊断、痰气郁结蒙蔽神窍病机，以及理气解郁、化痰醒神治法' },
  ipmph_acupuncture_emergency: { level: 'A', organization: '人民卫生出版社主办人卫医学网', title: '中医助理医师实践技能考试：针灸穴位主治定位表', url: 'https://exam.ipmph.com/examzcms/zyzlzl/201206/t20120614_93222.htm', publishedOrYear: '2012-06-14', coreSupport: '内脏绞痛表中直接列明肾绞痛湿热配委阳、合谷' },
  lingtai_kidney_colic: { level: 'S', organization: '灵台县卫生健康局', title: '常见急症的针灸处理', url: 'https://www.lingtai.gov.cn/zfxxgk/fdzdgknr/zdmsxx/wsjk/art/2022/art_f8f1a560a15a45fca1e4996f6d43cd0c.html', publishedOrYear: '2022', coreSupport: '肾绞痛湿热重者加委阳、合谷' },
  hunan_pharmacy_xueyutan: { level: 'B', organization: '湖南药事服务网', title: '血余炭', url: 'https://www.hnysfww.com/mobile/goods.php?id=8711', publishedOrYear: '未标明', coreSupport: '血余炭可煎服或研末服，研末每次1.5至3克' },
  experimental_diagnosis_textbook: { level: 'C', organization: '《实验诊断学理论教材》公开PDF', title: '实验诊断学理论教材', url: 'https://fztr.file.gkfz.net/pdf/3b1cd33868b18255a82d7bed9344f14e.pdf', publishedOrYear: '未标明', accessNote: '已实际打开并核对PDF第103页；公开文件未标明出版机构，按C级使用', coreSupport: '膀胱体部表浅炎症时多见大而圆的移行上皮细胞（大圆上皮细胞）' },
  caivd_urine_epithelial_cells: { level: 'B', organization: '全国卫生产业企业管理协会医学检验产业分会网络平台', title: '医学“侦查兵”的秘密（16）', url: 'https://caivd-org.cn/article.asp?id=2273', publishedOrYear: '2015-08-12', accessNote: '已实际打开正文并核对大圆上皮细胞条目', coreSupport: '大圆上皮细胞大量成堆出现见于膀胱炎' },
  cqmu_liver_palpation: { level: 'A', organization: '重庆医科大学', title: '健康评估之腹部检查', url: 'https://e-learning.cqmu.edu.cn/meol/analytics/resPdfShow.do%3Bjsessionid%3DD50F0F6756B3A4D6740BCF8FE1F58774?lid=4485&resId=131008', publishedOrYear: '未标明', coreSupport: '肝脏质韧如触鼻尖见于慢性肝炎、脂肪肝、肝淤血' },
  jscn_health_assessment: { level: 'A', organization: '江苏护理职业学院', title: '健康评估（高职高专护理专业“十四五”教材）', url: 'https://www.jscn.edu.cn/__local/6/F7/28/857095CDECD45D5A255C1406D04_09EBD359_3407079.pdf', publishedOrYear: '2024', accessNote: '已实际打开并核对PDF第119页肝脏触诊正文', coreSupport: '质韧肝脏可见于慢性肝炎或脂肪肝；肝区压痛见于肝炎等肝包膜炎症或牵拉状态' },
  xinjiang_sputum: { level: 'S', organization: '新疆维吾尔自治区卫生健康委员会', title: '痰液变奇怪了？看痰可识病', url: 'https://wjw.xinjiang.gov.cn/hfpc/jkcj/202501/f27efe83a73b4baf92b08baf46de34ec.shtml', publishedOrYear: '2025-01-16', coreSupport: '黏液性痰黏稠、无色或灰色，多见于急性支气管炎、支气管哮喘、早期肺炎' },
  neea_chronic_convulsion: { level: 'A', organization: '教育部教育考试院', title: '同等学力人员申请中医硕士专业学位学科综合水平全国统一考试大纲', url: 'https://tdxl.neea.edu.cn/res/Home/2302/1afc802a28b20588cbb671b9482079ad.pdf', publishedOrYear: '2016', coreSupport: '与本题症状高度一致的示例题答案为慢惊风阴虚风动证' },
  ipmph_yinhuang: { level: 'A', organization: '人民卫生出版社主办人卫医学网', title: '中医执业医师实践技能考试复习精要', url: 'https://exam.ipmph.com/examzcms/zyzyzl/201206/t20120614_93206.htm', publishedOrYear: '2012-06-14', coreSupport: '阴黄寒湿阻遏证治法为温中化湿、健脾和胃' },
  zqmc_yinhuang: { level: 'A', organization: '肇庆医学高等专科学校口腔医院', title: '李力强教授治疗黄疸临床经验', url: 'https://kqyy.zqmc.edu.cn/info/1083/1979.htm', publishedOrYear: '2023-12-06', coreSupport: '阴黄由寒湿阻遏中焦，并直接给出温中健脾、利湿退黄治法' },
  nhsa_pertussis: { level: 'S', organization: '国家医疗保障局', title: '儿科医生教你听咳嗽辨疾病', url: 'https://www.nhsa.gov.cn/art/2024/10/16/art_52_14241.html', publishedOrYear: '2024-10-16', coreSupport: '阵发性痉挛性咳嗽后出现吸气性鸡鸣样回声提示百日咳' },
  beijing_pertussis: { level: 'S', organization: '北京市卫生健康委员会（首都儿科研究所）', title: '百日咳和其他咳嗽有什么不同？', url: 'https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jbzs/202305/t20230530_3116818.html', publishedOrYear: '2023-05-18', coreSupport: '痉咳期阵发性痉挛咳嗽、鸡鸣样回声及反射性呕吐' },
  minzu_pertussis: { level: 'C', organization: '民族医药报', title: '百日咳的中医辨证论治', url: 'https://epaper.oss-cn-hangzhou.aliyuncs.com/mzyyb/2024-06-07/d2d9463e420b70d5d881b2c38ce68859.pdf', publishedOrYear: '2024-06-07', coreSupport: '痉咳期痰火阻肺型的症状、清热泻肺与涤痰镇咳治法' },
  tcm_exam_outline_pertussis: { level: 'A', organization: '国家中医药管理局中医师资格认证中心资料站', title: '中医执业助理医师资格考试大纲', url: 'https://www.tcmtest.org.cn/ueditor/jsp/upload/file/20170807/1502111554256014433.pdf', publishedOrYear: '2017', coreSupport: '考试大纲明确列入百日咳痉咳期病机、痰火阻肺证症状与治法' },
  tcm_urolithiasis_pathway: { level: 'S', organization: '国家中医药管理部门发布的中医临床路径（公开镜像）', title: '石淋（尿石症）中医临床路径（2018年版）', url: 'https://www.yaopinnet.com/tools/linchuanglujing/zy/zy201800341.pdf', publishedOrYear: '2018', accessNote: '已核对临床路径正文；当前URL为公开镜像，原文件为国家中医临床路径', coreSupport: '石淋常见肾气不足证及其补肾益气、通淋排石治疗方向' },
  singapore_tcm_mumps: { level: 'A', organization: '新加坡中医学院', title: '中医临床诊病技能练习题集（十三五）', url: 'https://www.singaporetcm.edu.sg/cn/doc/library/%E3%80%8A%E4%B8%AD%E5%8C%BB%E4%B8%B4%E5%BA%8A%E8%AF%8A%E7%97%85%E6%8A%80%E8%83%BD%E7%BB%83%E4%B9%A0%E9%A2%98%E9%9B%86%EF%BC%88%E5%8D%81%E4%B8%89%E4%BA%94%EF%BC%89%E3%80%8B.pdf', publishedOrYear: '十三五', coreSupport: '热毒蕴结型痄腮病例逐项列出高热、腮部肿痛坚硬拒按、咽红、便秘尿黄、红舌黄苔和滑数脉，并给出清热解毒、散结软坚治法' },
  postpartum_textbook: { level: 'A', organization: '全国高等中医院校教材《中医妇科学》第五版', title: '中医妇科学（第五版）产后发热', url: 'https://phongkhamdongyhungphat.com/upload/file/%E4%B8%AD%E5%8C%BB%E5%A6%87%E7%A7%91%E5%AD%A6%E4%BA%94%E7%89%88-1756870032.pdf', publishedOrYear: '1985', accessNote: '已实际打开公开扫描件，核对封面、编写说明及书页137至138的产后发热感染邪毒证正文；URL为第三方镜像', coreSupport: '感染邪毒证直接列出高热寒战、小腹疼痛拒按、恶露色紫黯如败酱且有臭气，并见口渴、尿黄、便秘、红舌黄苔、数脉' },
  xjtu_leukopenia_syllabus: { level: 'A', organization: '西安交通大学医学部', title: '“血液与肿瘤疾病”区段理论与实验教学大纲', url: 'https://yxbpyc.xjtu.edu.cn/info/1086/1672.htm', publishedOrYear: '2018-06-21', coreSupport: '白细胞减少症教学内容直接强调去除病因是最合理的治疗' },
  bucm_leg_ulcer: { level: 'A', organization: '北京中医药大学远程教育学院', title: '中医外科学课程：臁疮', url: 'https://jxjyxb.bucm.edu.cn/ibucm/zhengwen/update/1_94.htm', publishedOrYear: '未标明', coreSupport: '臁疮湿热下注证治宜清热利湿、和营消肿' },
  wikisource_yizongjinjian: { level: 'C', organization: '维基文库经典文献库', title: '《医宗金鉴·外科卷下》', url: 'https://zh.wikisource.org/wiki/%E9%86%AB%E5%AE%97%E9%87%91%E9%91%92/%E5%A4%96%E7%A7%91%E5%8D%B7%E4%B8%8B', publishedOrYear: '经典原文', coreSupport: '肝脾热毒所致丹毒使用化斑解毒汤的经典依据' },
  fujian_acarbose: { level: 'S', organization: '福建省药品监督管理局', title: '另辟蹊径的降糖药物——α-糖苷酶抑制剂', url: 'https://yjj.scjgj.fujian.gov.cn/ztzl/kpzl/spyjts/ypaqjs/202104/t20210416_5575766.htm', publishedOrYear: '2021-04-16', coreSupport: '阿卡波糖延缓碳水化合物吸收并降低餐后血糖' },
  nhc_status_epilepticus: { level: 'S', organization: '国家卫生健康委员会', title: '精神药品临床应用指导原则', url: 'https://www.nhc.gov.cn/wjw/gfxwj/200703/65400508c87a46c48a7372d743821a7a.shtml', publishedOrYear: '2007', coreSupport: '地西泮可静脉用于癫痫持续状态' },
  zmu_status_epilepticus: { level: 'A', organization: '遵义医科大学', title: '镇静催眠药教学课件', url: 'https://jpkcylx.zmu.edu.cn/__local/B/08/2B/6264080ED50CD6653354007BB2F_A1EFE694_9600E.pdf?e=.pdf', publishedOrYear: '未标明', coreSupport: '治疗癫痫持续状态首选地西泮' },
  yueyang_status_epilepticus: { level: 'B', organization: '岳阳市人民政府', title: '卫生应急知识要点', url: 'https://www.yueyang.gov.cn/web/2570/2598/3440/content_470385.html', publishedOrYear: '2013-11-20', coreSupport: '癫痫持续状态首选地西泮5至10mg静脉缓慢注射' },
  med66_five_delays: { level: '辅助', organization: '正保医学教育网', title: '五迟、五软的病因、诊断要点和辨证论治', url: 'https://rasp.med66.com/zhongyiyishi/fudaopeixun/wa2006025829.shtml', publishedOrYear: '2020', coreSupport: '考试资料将染色体病归于先天不足、病多在肝肾脑髓；未找到可独立核对的A级正文' },
  med66_biliary_colic: { level: '辅助', organization: '正保医学教育网', title: '中医执业助理医师答疑周刊：胆绞痛配穴', url: 'https://www.med66.com/zhongyizhuliyishi/dayi/lz1611236514.shtml', publishedOrYear: '2016-11-23', coreSupport: '辅助资料直接列胆绞痛肝胆湿热配内庭、阴陵泉；未检得独立权威正文支持同一组合' },
  med66_leg_ulcer: { level: '辅助', organization: '正保医学教育网', title: '中医臁疮的辨证论治', url: 'https://www.med66.com/new/201404/wy201404235473.shtml', publishedOrYear: '2014-04-23', coreSupport: '辅助资料写作二妙丸合五神汤，与原题选项二妙汤及高校大纲三妙散均不完全一致' },
};

const assignments = new Map();
function assign(ids, sourceIds, {
  confidence = 'high',
  versionRisk = 'low',
  support = '',
  substantiveSourceIds = sourceIds,
  independentVerificationReason = null,
} = {}) {
  for (const id of ids) {
    if (assignments.has(id)) throw new Error(`证据分配重复：${id}`);
    assignments.set(id, {
      sourceIds,
      substantiveSourceIds,
      confidence,
      versionRisk,
      support,
      independentVerificationReason,
    });
  }
}

assign(['2023-U1-017'], ['bucm_xiaoyao']);
assign(['2023-U1-063'], ['zcmu_materia_medica', 'tsinghua_tcm_contraindications'], { versionRisk: 'medium', support: '两所高校资料均直接将红花列为妊娠慎用药；解析已删除来源未直接证明的子宫兴奋表述。', independentVerificationReason: '妊娠用药禁忌题' });
assign(['2023-U1-095'], ['dayi_xueyutan', 'hunan_pharmacy_xueyutan'], { versionRisk: 'medium', support: '两个独立药学资料均直接支持血余炭可煎服或研末内服；解析不再借其他药物煎法作排除推断。', independentVerificationReason: '中药特殊煎服法题' });
assign(['2023-U1-117'], ['tcm_diagnostics_seventh', 'sstp_tcm_diagnostics_catalog'], { substantiveSourceIds: ['tcm_diagnostics_seventh'], support: '规划教材闻诊正文直接将咳声不扬、痰稠色黄、不易咯出归为热邪犯肺、肺津被灼；出版社书目核实教材信息。' });
assign(['2023-U1-118'], ['dayi_phlegm_lung', 'hactcm_acute_bronchitis'], { support: '两个来源均直接支持痰湿阻肺的咳声重浊或咳嗽、痰多色白且较易咯出。' });
assign(['2023-U1-119', '2023-U1-120'], ['ahtcm_formula_songs']);
assign(['2023-U1-121'], ['zzsqmc_yinyang']);
assign(['2023-U1-126'], ['ctext_lingshu', 'bucm_water_edema'], { versionRisk: 'medium', support: '经典原文和北京中医药大学资料均直接支持按手足窅而不起为风水肤胀，并确认题干存在OCR异体字。', independentVerificationReason: '经典原文及OCR字形题' });
assign(['2023-U1-137'], ['ahtcm_diagnosis_course']);
assign(['2023-U1-138'], ['jxutcm_cold_damp_spleen']);
assign(['2023-U1-145'], ['zzsqmc_liver_system']);

assign(['2023-U2-025'], ['zibo_sah', 'beijing_sah'], { independentVerificationReason: '首选诊断检查题' });
assign(['2023-U2-027', '2023-U2-065'], ['lnpc_tb_imaging', 'shutcm_curriculum']);
assign(['2023-U2-057', '2023-U2-137'], ['beijing_gov_medical_dispute', 'tsinghua_medical_ethics'], { versionRisk: 'medium', support: '法规与医学伦理教材独立交叉核对；法规自2018年10月1日起施行，适用于2023年考试时点。', independentVerificationReason: '法规和医学伦理题' });
assign(['2023-U2-098'], ['xjtu_leukopenia_syllabus'], { support: '西安交通大学血液学教学大纲在白细胞减少症治疗中直接强调去除病因是最合理的治疗。' });
assign(['2023-U2-107'], ['beijing_pancreatitis']);
assign(['2023-U2-113'], ['zmu_status_epilepticus', 'yueyang_status_epilepticus', 'nhc_status_epilepticus'], { versionRisk: 'medium', substantiveSourceIds: ['zmu_status_epilepticus', 'yueyang_status_epilepticus'], support: '高校药理课件和政府卫生应急资料均直接明确癫痫持续状态首选静脉地西泮；国家指导原则进一步核对其静脉用途。', independentVerificationReason: '首选急救用药题' });
assign(['2023-U2-115'], ['caae_epilepsy']);
assign(['2023-U2-117'], ['zqmc_health_assessment', 'zqmc_pediatric_nursing']);
assign(['2023-U2-119'], ['smu_urine_casts']);
assign(['2023-U2-121'], ['lzu_terminal_disinfection']);
assign(['2023-U2-123'], ['xxmu_jaundice']);
assign(['2023-U2-125'], ['fudan_breast_cancer']);
assign(['2023-U2-127'], ['caivd_urine_epithelial_cells', 'experimental_diagnosis_textbook'], { confidence: 'medium', versionRisk: 'medium', support: '医学检验专业平台正文直接指出大圆上皮细胞大量成堆见于膀胱炎；实验诊断教材进一步限定为膀胱体部表浅炎症。' });
assign(['2023-U2-129'], ['cqmu_liver_palpation', 'jscn_health_assessment'], { confidence: 'medium', versionRisk: 'medium', support: '两份高校诊断/健康评估教材均确认慢性肝炎可见质韧肝脏，并把压痛归于肝炎或肝淤血等肝包膜炎症/牵拉状态；题干“质韧或稍硬、压痛较轻”在所列选项中指向慢性肝炎。', independentVerificationReason: '慢性肝炎与脂肪肝触诊特征存在部分重叠' });
assign(['2023-U2-131'], ['tsinghua_acarbose', 'fujian_acarbose'], { versionRisk: 'high', support: '高校医院与省级药监部门均直接支持阿卡波糖主要降低餐后血糖；“首选”仅限原题选项语境。', independentVerificationReason: '首选降糖药题及现实用药边界' });
assign(['2023-U2-133'], ['xinjiang_sputum'], { support: '省级卫生健康委正文直接将黏液性痰列见于支气管哮喘；解析明确限定为题目所列选项。' });
assign(['2023-U2-135'], ['smmu_alt']);
assign(['2023-U2-141'], ['tsinghua_medical_ethics']);
assign(['2023-U2-143'], ['gxtcmu_ecg']);
assign(['2023-U2-147'], ['jzmu_uremia']);
assign(['2023-U2-149'], ['ahtcm_formula_songs', 'lf_formula_textbook']);

assign(['2023-U3-044'], ['shutcm_acupuncture_syllabus'], { support: '高校针灸教学大纲在补虚泻实原则下直接列出陷下则灸之。' });
assign(['2023-U3-094', '2023-U3-095'], ['lf_formula_textbook', 'ahtcm_formula_songs'], { independentVerificationReason: '方剂组成和主治题' });
assign(['2023-U3-106'], ['bucm_dianbing_course'], { support: '北京中医药大学课程正文直接给出癫病痰气郁结病机和抑郁、淡漠、沉默痴呆特征。' });
assign(['2023-U3-107'], ['cacm_phlegm_qi_treatment'], { support: '中华中医药学会临床案例正文直接给出癫病气郁痰结证的痰气郁结、蒙蔽神窍病机及理气解郁、化痰醒神治法。' });
assign(['2023-U3-118'], ['zqmc_yinhuang', 'ipmph_yinhuang'], { support: '高校临床资料与人卫医学网均直接支持寒湿阻遏型阴黄及其辨证边界。' });
assign(['2023-U3-119'], ['ipmph_yinhuang', 'zqmc_yinhuang'], { support: '人卫医学网直接给出温中化湿、健脾和胃；高校资料独立支持阴黄温中健脾、利湿退黄方向。' });
assign(['2023-U3-125', '2023-U3-126'], ['lnc_acupuncture', 'ahtcm_acupoints'], { independentVerificationReason: '腧穴分类和归属题' });
assign(['2023-U3-135'], ['ahtcm_diagnosis_course', 'shutcm_curriculum']);
assign(['2023-U3-147'], ['ipmph_acupuncture_emergency', 'lingtai_kidney_colic'], { versionRisk: 'medium', support: '人卫医学网和政府卫生部门两个独立来源均直接列出肾绞痛湿热配委阳、合谷。', independentVerificationReason: '具体绞痛配穴组合题' });

assign(['2023-U4-032'], ['gxtcmu_combined_surgery', 'xuzhou_drug_rash'], { versionRisk: 'medium' });
assign(['2023-U4-056'], ['gxtcmu_surgery', 'wikisource_yizongjinjian'], { versionRisk: 'medium', support: '高校外科学资料与《医宗金鉴》经典原文独立支持肝脾湿火丹毒及化斑解毒汤。', independentVerificationReason: '首选治疗方剂题' });
assign(['2023-U4-085', '2023-U4-099', '2023-U4-100'], ['btmc_pediatrics', 'shutcm_curriculum'], { versionRisk: 'medium', support: '两所高校教学大纲独立列明急性肾炎变证及相应治法。' });
assign(['2023-U4-088'], ['neea_chronic_convulsion'], { support: '教育部教育考试院大纲示例题与本题症状链高度一致，答案直接标为慢惊风阴虚风动。' });
assign(['2023-U4-090', '2023-U4-091'], ['njucm_infertility', 'hactcm_infertility'], { versionRisk: 'medium' });
assign(['2023-U4-093'], ['gxtcmu_surgery', 'bucm_leg_ulcer'], { versionRisk: 'medium', support: '两所中医药大学资料均直接支持臁疮湿热下注证；本题只保留证型判断，不延伸到存在冲突的具体合方。', independentVerificationReason: '与争议方剂题共用题干的证型题' });
assign(['2023-U4-096'], ['nhsa_pertussis', 'beijing_pertussis'], { support: '两个政府卫生来源均直接支持阵发性痉咳、鸡鸣样回声与百日咳痉咳期。' });
assign(['2023-U4-097'], ['minzu_pertussis', 'tcm_exam_outline_pertussis', 'med66_pertussis'], { versionRisk: 'medium', substantiveSourceIds: ['minzu_pertussis'], support: '正式医学报刊正文直接覆盖痉咳期、痰火阻肺症状和清热泻肺、涤痰镇咳治法；考试大纲和培训资料仅作体系及措辞旁证。' });
assign(['2023-U4-102', '2023-U4-103'], ['tcm_urolithiasis_pathway'], { confidence: 'medium', versionRisk: 'medium', support: '2018年中医临床路径直接列肾气不足证，并给出补肾益气、通淋排石治疗方向。' });
assign(['2023-U4-105', '2023-U4-106'], ['singapore_tcm_mumps'], { support: '正规中医学院临床技能教材的热毒蕴结型痄腮病例逐项覆盖题干全部关键症状，并直接给出清热解毒、散结软坚治法。' });
assign(['2023-U4-108', '2023-U4-109'], ['dayi_zhengjia', 'shutcm_curriculum']);
assign(['2023-U4-111'], ['postpartum_textbook', 'med66_postpartum'], { versionRisk: 'medium', substantiveSourceIds: ['postpartum_textbook'], support: '教材表格逐项直接覆盖高热寒战、小腹拒按、恶露紫黯如败酱且臭秽，并标为感染邪毒证；培训资料仅作辅助。' });
assign(['2023-U4-114', '2023-U4-115'], ['btmc_pediatrics', 'shutcm_curriculum']);

const sourceEntries = Object.entries(AUTHORITY_SOURCE_CATALOG);
for (const [sourceId, source] of sourceEntries) {
  Object.assign(source, { sourceId, opened: true, accessedOn: '2026-08-24' });
}

const questionById = new Map(QUESTIONS_2023.map(question => [question.id, question]));
const backfillById = new Map(AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS.map(item => [item.id, item]));

function resolveSources(questionId, sourceIds) {
  return sourceIds.map(sourceId => {
    const source = AUTHORITY_SOURCE_CATALOG[sourceId];
    if (!source) throw new Error(`权威检索来源不存在：${questionId} ${sourceId}`);
    return source;
  });
}

const disputeDefinitions = [
  {
    questionId: '2023-U1-125',
    sourceIds: ['bucm_skin_scale', 'ctext_lingshu'],
    conflictingSourceIds: ['ctext_lingshu', 'bucm_skin_scale'],
    supportNote: '现代教材体系常将肌肤甲错与瘀血相联，但本题原句“尺肤粗如枯鱼之鳞”在《灵枢·论疾诊尺》中直接作“水泆饮也”；不能把肌肤甲错与尺肤原句无条件等同。',
    conflictReason: '原答案C可由部分现代教材的肌肤甲错口径解释，但经典原文直接对应水泆饮；现有选项又没有水饮，属于经典原文与现代题库口径的实质冲突。',
    possibleTextbookVersionDifference: true,
    independentVerificationReason: '经典原文与现代教材归类存在实质分歧',
  },
  {
    questionId: '2023-U2-139',
    sourceIds: ['enteric_fever_textbook', 'beijing_fever_patterns'],
    conflictingSourceIds: ['enteric_fever_textbook', 'beijing_fever_patterns'],
    supportNote: '原题问“伤寒初期”，现答案A描述弛张热；教材将初期描述为体温逐渐升高，稽留热或弛张热主要见于极期，现有选项与答案不能无争议对应。',
    conflictReason: '题干限定伤寒初期，A项却是弛张热定义；两份独立资料均把伤寒初期描述为体温逐渐上升，把稽留热或弛张热主要置于极期。',
    possibleTextbookVersionDifference: false,
    independentVerificationReason: '现有答案与教材病程阶段发生实质冲突',
  },
  {
    questionId: '2023-U3-148',
    sourceIds: ['ipmph_acupuncture_emergency', 'med66_biliary_colic'],
    conflictingSourceIds: [],
    supportNote: '辅助考试资料直接给出胆绞痛肝胆湿热配内庭、阴陵泉，但实际打开的权威针灸资料只支持胆绞痛常规取穴或相关穴位，未直接支持这一具体组合。',
    conflictReason: '只能找到辅助考试资料直接支持当前组合，未找到第二个独立权威出版体系的正文；穴位归经、一般主治或相近配穴不足以证明本题答案。',
    possibleTextbookVersionDifference: true,
    independentVerificationReason: '具体绞痛配穴组合缺少权威双来源实质支持',
  },
  {
    questionId: '2023-U4-094',
    sourceIds: ['gxtcmu_surgery', 'med66_leg_ulcer'],
    conflictingSourceIds: ['gxtcmu_surgery'],
    supportNote: '辅助资料写作“二妙丸合五神汤”，原选项写“二妙汤合五神汤”，广西中医药大学教学大纲则明确写“三妙散合五神汤”；三种文字并不等同。',
    conflictReason: 'A级高校教学资料与原答案发生直接冲突；辅助资料虽接近原答案，但方名为二妙丸而非二妙汤，不能据此消除冲突。',
    possibleTextbookVersionDifference: true,
    independentVerificationReason: '规划教材体系的具体合方与原答案冲突',
  },
  {
    questionId: '2023-U4-133',
    sourceIds: ['btmc_pediatrics', 'shutcm_curriculum', 'med66_five_delays'],
    conflictingSourceIds: [],
    supportNote: '辅助考试资料直接把染色体病归于先天不足、病多在肝肾脑髓；两份高校教学大纲只覆盖五迟五软课程范围，未在正文直接给出这一细分病因定位。',
    conflictReason: '当前答案只获得辅助考试资料的直接支持；高校大纲属于相关背景而非证明，未达到正式后补解析至少一个可靠核心来源的门槛。',
    possibleTextbookVersionDifference: false,
    independentVerificationReason: '细分病因定位缺少可靠核心来源',
  },
];

export const AUTHORITY_RESEARCHED_EXPLANATION_RECORDS = [
  ...AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS.map((backfill) => {
    const question = questionById.get(backfill.id);
    const evidence = assignments.get(backfill.id);
    if (!question || !evidence) throw new Error(`权威检索证据不完整：${backfill.id}`);
    const sources = resolveSources(backfill.id, evidence.sourceIds);
    const substantiveSources = resolveSources(backfill.id, evidence.substantiveSourceIds);
    const substantiveOrganizations = new Set(substantiveSources.map(source => source.organization));
    return {
      questionId: question.id,
      year: 2023,
      unit: question.unit,
      number: question.number,
      type: question.type,
      originalAnswer: question.answer,
      currentAnswer: question.answer,
      originalExplanationStatus: question.id === '2023-U4-056' ? 'polluted-unusable' : 'missing-placeholder',
      finalStatus: 'backfilled',
      backfilledExplanation: backfill.after,
      sources,
      substantiveSources,
      secondSourceVerified: substantiveOrganizations.size >= 2,
      sourceConflict: false,
      versionRisk: evidence.versionRisk,
      confidence: evidence.confidence,
      supportNote: evidence.support,
      independentVerificationRequired: Boolean(evidence.independentVerificationReason),
      independentVerificationReason: evidence.independentVerificationReason,
      semanticReviewStatus: 'passed',
      semanticReviewNote: evidence.support || substantiveSources.map(source => source.coreSupport).join('；'),
      reverseReviewPassed: true,
      automatedSemanticValidation: false,
      writtenToQuestionBank: true,
      researchedAt: '2026-08-24',
      semanticReviewedAt: '2026-08-24',
    };
  }),
  ...disputeDefinitions.map((definition) => {
    const question = questionById.get(definition.questionId);
    if (!question) throw new Error(`争议题不存在：${definition.questionId}`);
    const sources = resolveSources(definition.questionId, definition.sourceIds);
    const conflictingSources = resolveSources(definition.questionId, definition.conflictingSourceIds);
    return {
      questionId: question.id,
      year: 2023,
      unit: question.unit,
      number: question.number,
      type: question.type,
      stem: question.stem,
      options: question.options,
      originalAnswer: question.answer,
      currentAnswer: question.answer,
      currentAnswerText: question.options[question.answer],
      supportingCurrentAnswerSources: [{
        kind: 'original-answer-document',
        title: '考题2023+答案.docx',
        support: `原始答案资料将本题答案标为${question.answer}，但未提供实质解析。`,
      }],
      conflictingSources,
      insufficientOrContextOnlySources: sources.filter(source => !definition.conflictingSourceIds.includes(source.sourceId)),
      originalExplanationStatus: 'missing-placeholder',
      finalStatus: 'answer-dispute',
      backfilledExplanation: null,
      sources,
      substantiveSources: conflictingSources,
      secondSourceVerified: new Set(conflictingSources.map(source => source.organization)).size >= 2,
      sourceConflict: conflictingSources.length > 0,
      versionRisk: 'high',
      confidence: 'low',
      supportNote: definition.supportNote,
      conflictReason: definition.conflictReason,
      possibleTextbookVersionDifference: definition.possibleTextbookVersionDifference,
      independentVerificationRequired: true,
      independentVerificationReason: definition.independentVerificationReason,
      semanticReviewStatus: 'disputed',
      semanticReviewNote: definition.supportNote,
      reverseReviewPassed: false,
      automatedSemanticValidation: false,
      writtenToQuestionBank: false,
      researchedAt: '2026-08-24',
      semanticReviewedAt: '2026-08-24',
    };
  }),
];

export const AUTHORITY_RESEARCH_SUMMARY = {
  targetCount: 71,
  backfilledCount: AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS.length,
  disputeCount: disputeDefinitions.length,
  answerChangedCount: 0,
  uiContainsSourceUrls: false,
};

if (assignments.size !== AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS.length) {
  throw new Error(`证据分配数量异常：${assignments.size}`);
}
for (const id of assignments.keys()) {
  if (!backfillById.has(id)) throw new Error(`证据分配存在非补全题：${id}`);
}
