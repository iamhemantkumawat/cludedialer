import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ContactsService } from './contacts.service';

@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get('contact-lists')
  getContactLists(@Query('sip_account_id') sipAccountId?: string) {
    return this.contactsService.getContactLists(sipAccountId);
  }

  @Post('contact-lists')
  createContactList(@Body() body: any) {
    return this.contactsService.createContactList(body);
  }

  @Patch('contact-lists/:id')
  renameContactList(@Param('id') id: string, @Body() body: any) {
    return this.contactsService.renameContactList(id, body.list_name);
  }

  @Delete('contact-lists/:id')
  deleteContactList(@Param('id') id: string) {
    return this.contactsService.deleteContactList(id);
  }

  @Get('contacts')
  getContacts(
    @Query('list_id') listId?: string,
    @Query('q') query?: string,
    @Query('status') status?: string,
  ) {
    return this.contactsService.getContacts({ listId, query, status });
  }

  @Post('contacts')
  addContact(@Body() body: any) {
    return this.contactsService.addContact(body);
  }

  @Delete('contacts/:id')
  deleteContact(@Param('id') id: string) {
    return this.contactsService.deleteContact(id);
  }

  @Post('contacts/import')
  importContacts(@Body() body: any) {
    return this.contactsService.importContacts(body);
  }

  @Post('contacts/cleanup')
  cleanupContacts(@Body() body: any) {
    return this.contactsService.cleanupContacts(body);
  }
}
