export const CORE_SPIRIT_SESSION_CALENDAR_VERSION = 1 as const;
export type CoreSpiritSessionWindow=Readonly<{
 id:string;timezone:string;openMinute:number;closeMinute:number;
 phases?:ReadonlyArray<{id:string;startMinute:number;endMinute:number}>;
 holidayDates?:ReadonlyArray<string>;
 specialSessions?:ReadonlyArray<{date:string;openMinute:number;closeMinute:number}>;
}>;
export const CORE_SPIRIT_SESSION_CALENDARS:Readonly<Record<string,CoreSpiritSessionWindow>>={
 NSE_EQUITIES:{id:'NSE_EQUITIES',timezone:'Asia/Kolkata',openMinute:555,closeMinute:930},
 US_EQUITIES:{id:'US_EQUITIES',timezone:'America/New_York',openMinute:570,closeMinute:960},
};
export function resolveSessionCalendar(calendarId='NSE_EQUITIES'):CoreSpiritSessionWindow{return CORE_SPIRIT_SESSION_CALENDARS[calendarId]||CORE_SPIRIT_SESSION_CALENDARS.NSE_EQUITIES;}
export function isSessionTradingDay(calendar:CoreSpiritSessionWindow,isoDate:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(isoDate))return false;
 const day=new Date(`${isoDate}T12:00:00Z`).getUTCDay();
 return day!==0&&day!==6&&!calendar.holidayDates?.includes(isoDate);
}
export function sessionWindowForDate(calendar:CoreSpiritSessionWindow,isoDate:string){
 if(!isSessionTradingDay(calendar,isoDate))return null;
 const special=calendar.specialSessions?.find(x=>x.date===isoDate);
 return {openMinute:special?.openMinute??calendar.openMinute,closeMinute:special?.closeMinute??calendar.closeMinute};
}
